import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, signSession, slugify, SESSION_COOKIE_NAME, SESSION_DURATION } from '@/lib/auth'
import { trialEndDate } from '@/lib/plans'
import { PlanCode } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      businessName,
      addressLine1,
      city,
      contactNumber,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      username,
      password,
      confirmPassword,
      planCode,
      agreedToTerms,
    } = body ?? {}

    if (!businessName || !addressLine1 || !city || !contactNumber || !ownerFirstName || !ownerLastName || !ownerEmail || !username || !password) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords don't match." }, { status: 400 })
    }
    if (!agreedToTerms) {
      return NextResponse.json({ error: 'You must agree to the Terms of Service and Privacy Policy.' }, { status: 400 })
    }

    const requestedPlanCode = Object.values(PlanCode).includes(planCode) ? planCode : PlanCode.SPROUT
    const plan = await prisma.plan.findUnique({ where: { code: requestedPlanCode } })
    if (!plan) {
      return NextResponse.json({ error: 'Selected plan is not available.' }, { status: 400 })
    }

    // Pharmacy names must be unique (case-insensitive) — this also prevents a
    // double-submitted signup from silently creating two workspaces with the
    // same name under different slugs.
    const existingByName = await prisma.tenant.findFirst({
      where: { name: { equals: businessName.trim(), mode: 'insensitive' } },
    })
    if (existingByName) {
      return NextResponse.json(
        { error: 'A pharmacy with this name is already registered. Please choose a different name, or log in if this is your workspace.' },
        { status: 409 }
      )
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } })
    if (existingUsername) {
      return NextResponse.json({ error: 'That username is already taken. Please choose another.' }, { status: 409 })
    }

    const baseSlug = slugify(businessName) || 'store'
    let slug = baseSlug
    let attempt = 1
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      attempt += 1
      slug = `${baseSlug}-${attempt}`
    }

    const passwordHash = await hashPassword(password)

    const tenant = await prisma.tenant.create({
      data: {
        name: businessName,
        slug,
        ownerEmail,
        contactNumber,
        onboardingStep: 1,
        stores: {
          create: {
            name: `${businessName} - Main Branch`,
            code: 'MAIN',
            isMainBranch: true,
            address: addressLine1,
            city,
          },
        },
        subscription: {
          create: {
            planId: plan.id,
            status: 'TRIALING',
            trialEndsAt: trialEndDate(),
            currentPeriodEnd: trialEndDate(),
          },
        },
        receiptSettings: {
          create: {
            storeName: businessName,
            addressLine1,
            contactNumber,
          },
        },
        notificationSettings: {
          create: {},
        },
      },
      include: { stores: true },
    })

    const mainStore = tenant.stores[0]

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        storeId: mainStore.id,
        email: ownerEmail,
        username,
        password: passwordHash,
        firstName: ownerFirstName || 'Owner',
        lastName: ownerLastName || '',
        role: 'OWNER',
      },
    })

    const token = signSession(
      {
        userId: user.id,
        tenantId: tenant.id,
        storeId: mainStore.id,
        role: user.role,
        tenantSlug: tenant.slug,
      },
      SESSION_DURATION.remembered.expiresIn
    )

    const response = NextResponse.json({
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      plan: { code: plan.code, name: plan.name },
    })

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_DURATION.remembered.cookieMaxAge,
    })

    return response
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'That email or username is already in use.' }, { status: 409 })
    }
    console.error('Signup failed', error)
    return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 })
  }
}
