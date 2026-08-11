import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, signSession, SESSION_COOKIE_NAME, SESSION_DURATION } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { workspaceSlug, identifier, password, rememberMe } = await request.json()

    if (!workspaceSlug || !identifier || !password) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({ where: { slug: workspaceSlug } })
    if (!tenant || !tenant.isActive) {
      return NextResponse.json({ error: 'Invalid workspace or credentials.' }, { status: 401 })
    }

    const user = await prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        isActive: true,
        OR: [{ email: identifier }, { username: identifier }],
      },
    })

    if (!user || !(await verifyPassword(password, user.password))) {
      return NextResponse.json({ error: 'Invalid workspace or credentials.' }, { status: 401 })
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
