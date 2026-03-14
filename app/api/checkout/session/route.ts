import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  // Lazy-instantiate so STRIPE_SECRET_KEY is only required at runtime, not build time
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-02-24.acacia',
  })
  try {
    const { resume_id } = await request.json()
    if (!resume_id) {
      return NextResponse.json({ error: 'Missing resume_id' }, { status: 400 })
    }

    // Authenticate the user
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Verify the user owns this resume
    const { data: resume } = await supabase
      .from('resumes')
      .select('id, is_paid')
      .eq('id', resume_id)
      .eq('owner_id', user.id)
      .single()

    if (!resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
    }

    if (resume.is_paid) {
      return NextResponse.json({ error: 'Already unlocked' }, { status: 409 })
    }

    const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: 900, // $9.00
            product_data: {
              name: 'Unlock all feedback',
              description: 'One-time payment · all comments visible forever',
            },
          },
        },
      ],
      customer_email: user.email,
      metadata: { resume_id },
      success_url: `${origin}/dashboard?payment=success`,
      cancel_url: `${origin}/dashboard`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Checkout session error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
