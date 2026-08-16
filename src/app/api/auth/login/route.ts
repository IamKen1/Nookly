import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, signSession, SESSION_COOKIE_NAME, SESSION_DURATION } from '@/lib/auth'
import { accountKeyFor, checkLoginRateLimit, getClientIp, recordFailedLoginAttempt } from '@/lib/login-rate-limit'

export async function POST(request: NextRequest) {
  try {
    const { identifier, password, rememberMe } = await request.json()

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const ip = getClientIp(request)
    const accountKeyHash = accountKeyFor(identifier)
    const rateLimit = await checkLoginRateLimit(accountKeyHash, ip)
    if (rateLimit.limited) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${rateLimit.retryAfterMinutes} minutes.` },
        { status: 429 }
      )
    }

    // Usernames are globally unique, so a single lookup identifies both the
    // user and their workspace — no need to ask for a workspace name at login.
    // Fetched together (one round trip) rather than as two sequential queries.
    const user = await prisma.user.findUnique({ where: { username: identifier }, include: { tenant: true } })

    if (!user || !user.isActive || !(await verifyPassword(password, user.password))) {
      await recordFailedLoginAttempt(accountKeyHash, ip)
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 })
    }

    const tenant = user.tenant
    if (!tenant || !tenant.isActive) {
      await recordFailedLoginAttempt(accountKeyHash, ip)
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 })
    }

    const duration = rememberMe ? SESSION_DURATION.remembered : SESSION_DURATION.short
    const token = signSession(
      {
        userId: user.id,
        tenantId: tenant.id,
        storeId: user.storeId,
        role: user.role,
        tenantSlug: tenant.slug,
      },
      duration.expiresIn
    )

    const response = NextResponse.json({
      user: { id: user.id, firstName: user.firstName, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    })

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      ...(duration.cookieMaxAge !== undefined ? { maxAge: duration.cookieMaxAge } : {}),
    })

    return response
  } catch (error) {
    console.error('Login failed', error)
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 })
  }
}
