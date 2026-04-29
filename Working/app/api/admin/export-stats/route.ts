import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    frozenUsers,
    totalFundRaisers,
    totalDonees,
    totalCampaigns,
    activeCampaigns,
    completedCampaigns,
    draftCampaigns,
    donationAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'active' } }),
    prisma.user.count({ where: { status: 'suspended' } }),
    prisma.user.count({ where: { status: 'frozen' } }),
    prisma.user.count({ where: { role: 'fund_raiser' } }),
    prisma.user.count({ where: { role: 'donee' } }),
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: 'active' } }),
    prisma.campaign.count({ where: { status: 'completed' } }),
    prisma.campaign.count({ where: { status: 'draft' } }),
    prisma.donation.aggregate({
      _sum: { amount: true },
      _count: { id: true },
      _avg: { amount: true },
    }),
  ])

  return NextResponse.json({
    stats: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      frozenUsers,
      totalFundRaisers,
      totalDonees,
      totalCampaigns,
      activeCampaigns,
      completedCampaigns,
      draftCampaigns,
      totalDonations: donationAgg._count.id,
      totalDonationAmount: Math.round((donationAgg._sum.amount ?? 0) * 100) / 100,
      averageDonation: Math.round((donationAgg._avg.amount ?? 0) * 100) / 100,
    },
  })
}
