import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session || (session.role !== 'admin' && session.role !== 'campaign_admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaigns = await prisma.campaign.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      serviceType: true,
      targetAmount: true,
      raisedAmount: true,
      donorCount: true,
      views: true,
      endDate: true,
      location: true,
      status: true,
      coverImage: true,
      createdAt: true,
      organiser: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          isVerified: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      campaignId: c.id,
      campaignTitle: c.title,
      title: c.title,
      campaignCategory: c.category,
      category: c.category,
      campaignServiceType: c.serviceType,
      serviceType: c.serviceType,
      targetAmount: c.targetAmount,
      raisedAmount: c.raisedAmount,
      donorCount: c.donorCount,
      views: c.views,
      endDate: c.endDate,
      location: c.location ?? '',
      status: c.status,
      coverImage: c.coverImage,
      createdAt: c.createdAt.toISOString(),
      submittedAt: c.createdAt.toISOString(),
      organiserName: `${c.organiser.firstName} ${c.organiser.lastName}`,
      organiserEmail: c.organiser.email,
      isOrganiserVerified: c.organiser.isVerified,
      flaggedIssues: [] as string[],
    })),
  })
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session || (session.role !== 'admin' && session.role !== 'campaign_admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { campaignId, status } = await req.json()
  if (!campaignId || !status) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const validStatuses = ['approved', 'rejected', 'under_review', 'on_hold', 'locked', 'active', 'draft']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // 'approved' in the review UI means the campaign goes live → store as 'active'
  const dbStatus = status === 'approved' ? 'active' : status

  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: dbStatus },
  })

  return NextResponse.json({ campaign })
}
