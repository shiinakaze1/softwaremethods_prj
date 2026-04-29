/**
 * Seed script for MySQL + Prisma.
 * Run with: node scripts/seed.js
 *
 * Creates demo users, categories, campaigns, donations, favourites,
 * campaign updates, and email automation rules.
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clear existing data in dependency order
  await prisma.donation.deleteMany()
  await prisma.favourite.deleteMany()
  await prisma.campaignUpdate.deleteMany()
  await prisma.campaignReport.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.campaign.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
  await prisma.emailTemplate.deleteMany()
  await prisma.emailLog.deleteMany()
  await prisma.emailAutomationRule.deleteMany()

  // Passwords
  const demoPassword = await bcrypt.hash('Demo1234', 10)
  const adminPassword = await bcrypt.hash('Admin@1234', 10)

  // Users
  const admin = await prisma.user.create({
    data: {
      email: 'admin@fundbridge.com',
      password: adminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'admin',
      isVerified: true,
      status: 'active',
      location: 'Remote',
    },
  })

  const campaignAdmin = await prisma.user.create({
    data: {
      email: 'campaignadmin@fundbridge.com',
      password: adminPassword,
      firstName: 'Campaign',
      lastName: 'Admin',
      role: 'campaign_admin',
      isVerified: true,
      status: 'active',
      location: 'Remote',
    },
  })

  const platformManager = await prisma.user.create({
    data: {
      email: 'platform@fundbridge.com',
      password: demoPassword,
      firstName: 'Platform',
      lastName: 'Manager',
      role: 'platform_manager',
      isVerified: true,
      status: 'active',
      location: 'Remote',
    },
  })

  const fundraiser1 = await prisma.user.create({
    data: {
      email: 'fundraiser@example.com',
      password: demoPassword,
      firstName: 'Kim',
      lastName: 'Lee',
      role: 'fund_raiser',
      isVerified: true,
      status: 'active',
      location: 'Singapore',
      bio: 'Community fundraiser focused on urgent care campaigns.',
    },
  })

  const fundraiser2 = await prisma.user.create({
    data: {
      email: 'fundraiser2@example.com',
      password: demoPassword,
      firstName: 'Alex',
      lastName: 'Wong',
      role: 'fund_raiser',
      isVerified: true,
      status: 'active',
      location: 'Singapore',
      bio: 'Education and scholarship fundraiser.',
    },
  })

  const donor1 = await prisma.user.create({
    data: {
      email: 'donor@example.com',
      password: demoPassword,
      firstName: 'David',
      lastName: 'Chen',
      role: 'donor',
      isVerified: true,
      status: 'active',
      location: 'Singapore',
    },
  })

  const donee1 = await prisma.user.create({
    data: {
      email: 'donee@example.com',
      password: demoPassword,
      firstName: 'Ivan',
      lastName: 'Tan',
      role: 'donee',
      isVerified: true,
      status: 'active',
      location: 'Singapore',
    },
  })

  const donee2 = await prisma.user.create({
    data: {
      email: 'donee2@example.com',
      password: demoPassword,
      firstName: 'Sarah',
      lastName: 'Lim',
      role: 'donee',
      isVerified: true,
      status: 'active',
      location: 'Singapore',
    },
  })

  console.log('Users created')

  // Categories
  await prisma.category.createMany({
    data: [
      { name: 'Medical & Health', description: 'Medical expenses and healthcare', icon: 'Heart', color: '#ef4444' },
      { name: 'Education', description: 'Schools, scholarships, and learning', icon: 'BookOpen', color: '#3b82f6' },
      { name: 'Emergency Relief', description: 'Disaster and emergency aid', icon: 'AlertTriangle', color: '#f97316' },
      { name: 'Community', description: 'Local community projects', icon: 'Users', color: '#22c55e' },
      { name: 'Environment', description: 'Conservation and climate', icon: 'Leaf', color: '#10b981' },
    ],
  })

  console.log('Categories created')

  // Campaigns
  const today = new Date()
  const endDate = new Date(today)
  endDate.setMonth(endDate.getMonth() + 3)
  const startStr = today.toISOString().split('T')[0]
  const endStr = endDate.toISOString().split('T')[0]

  const campaign1 = await prisma.campaign.create({
    data: {
      title: "Help Fund Jake's Cancer Treatment",
      summary: 'Jake needs urgent treatment for stage 3 lymphoma.',
      description:
        'Jake is a 34-year-old father of two who was recently diagnosed with stage 3 lymphoma. His treatment plan requires chemotherapy sessions over the next 6 months. Any contribution helps.',
      category: 'Medical & Health',
      serviceType: 'medical',
      status: 'active',
      targetAmount: 50000,
      raisedAmount: 23400,
      donorCount: 47,
      views: 1203,
      favouriteCount: 31,
      startDate: startStr,
      endDate: endStr,
      coverImage: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800',
      beneficiaryName: 'Jake Morrison',
      beneficiaryRelationship: 'Self',
      beneficiaryDescription: 'Father of two undergoing cancer treatment',
      organiserId: fundraiser1.id,
    },
  })

  const campaign2 = await prisma.campaign.create({
    data: {
      title: 'Scholarships for Underprivileged Students',
      summary: 'Providing university scholarships to 10 students in need.',
      description:
        'Ten bright students from low-income families have been accepted into university but cannot afford tuition. This fund will cover their first year of study.',
      category: 'Education',
      serviceType: 'education',
      status: 'active',
      targetAmount: 30000,
      raisedAmount: 18750,
      donorCount: 89,
      views: 2450,
      favouriteCount: 64,
      startDate: startStr,
      endDate: endStr,
      coverImage: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800',
      beneficiaryName: 'Student Scholarship Fund',
      beneficiaryDescription: '10 university students from low-income families',
      organiserId: fundraiser2.id,
    },
  })

  const campaign3 = await prisma.campaign.create({
    data: {
      title: 'Flood Relief for Affected Families',
      summary: 'Urgent aid for 200 families displaced by recent flooding.',
      description:
        'Recent flooding has displaced over 200 families in the eastern district. Funds will provide emergency shelter, food, and clothing for 3 months.',
      category: 'Emergency Relief',
      serviceType: 'emergency',
      status: 'active',
      targetAmount: 80000,
      raisedAmount: 61200,
      donorCount: 312,
      views: 8900,
      favouriteCount: 198,
      startDate: startStr,
      endDate: endStr,
      coverImage: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800',
      beneficiaryName: 'Eastern District Flood Victims',
      beneficiaryDescription: '200+ displaced families',
      organiserId: fundraiser1.id,
    },
  })

  await prisma.campaign.create({
    data: {
      title: 'Community Garden for Seniors',
      summary: 'Building a therapeutic garden for elderly residents at Sunshine Home.',
      description:
        'Sunshine Home houses 80 elderly residents who would benefit greatly from outdoor activity. This campaign funds raised garden beds, tools, seeds, and weekly volunteer sessions.',
      category: 'Community',
      serviceType: 'community',
      status: 'pending_review',
      targetAmount: 12000,
      raisedAmount: 0,
      donorCount: 0,
      views: 0,
      favouriteCount: 0,
      startDate: startStr,
      endDate: endStr,
      coverImage: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800',
      beneficiaryName: 'Sunshine Home Residents',
      beneficiaryDescription: '80 elderly residents',
      organiserId: fundraiser2.id,
    },
  })

  console.log('Campaigns created')

  // Donations
  await prisma.donation.createMany({
    data: [
      {
        campaignId: campaign1.id,
        donorId: donee1.id,
        donorName: 'Ivan Tan',
        donorEmail: 'donee@example.com',
        amount: 500,
        status: 'completed',
        message: 'Stay strong Jake!',
      },
      {
        campaignId: campaign1.id,
        donorId: donee2.id,
        donorName: 'Sarah Lim',
        donorEmail: 'donee2@example.com',
        amount: 200,
        status: 'completed',
      },
      {
        campaignId: campaign1.id,
        donorName: 'Anonymous',
        isAnonymous: true,
        amount: 1000,
        status: 'completed',
      },
      {
        campaignId: campaign2.id,
        donorId: donee1.id,
        donorName: 'Ivan Tan',
        donorEmail: 'donee@example.com',
        amount: 300,
        status: 'completed',
        message: 'Education is the future!',
      },
      {
        campaignId: campaign2.id,
        donorId: donee2.id,
        donorName: 'Sarah Lim',
        donorEmail: 'donee2@example.com',
        amount: 150,
        status: 'completed',
      },
      {
        campaignId: campaign3.id,
        donorId: donee1.id,
        donorName: 'Ivan Tan',
        donorEmail: 'donee@example.com',
        amount: 250,
        status: 'completed',
        message: 'Sending support.',
      },
      {
        campaignId: campaign3.id,
        donorName: 'Anonymous',
        isAnonymous: true,
        amount: 2000,
        status: 'completed',
      },
    ],
  })

  // Campaign updates
  await prisma.campaignUpdate.createMany({
    data: [
      {
        campaignId: campaign1.id,
        title: 'Treatment started',
        content: 'Jake has started his first round of chemotherapy. Thank you for your support!',
      },
      {
        campaignId: campaign2.id,
        title: 'Students selected',
        content: 'We have confirmed all 10 scholarship recipients. Letters have been sent!',
      },
      {
        campaignId: campaign3.id,
        title: 'Shelters deployed',
        content: '150 temporary shelters have been set up. Food distribution begins tomorrow.',
      },
    ],
  })

  // Favourites
  await prisma.favourite.createMany({
    data: [
      { userId: donee1.id, campaignId: campaign1.id },
      { userId: donee1.id, campaignId: campaign2.id },
      { userId: donee2.id, campaignId: campaign3.id },
    ],
  })

  // Email automation rules
  await prisma.emailAutomationRule.createMany({
    data: [
      {
        name: 'Thank You Email',
        triggerType: 'donation_received',
        isActive: true,
        subject: 'Thank you for your donation!',
        body: 'Dear {{recipientLabel}}, thank you for donating to {{campaignTitle}}.',
      },
      {
        name: 'Milestone 50%',
        triggerType: 'milestone_50',
        isActive: true,
        subject: 'Halfway there!',
        body: 'Dear {{recipientLabel}}, {{campaignTitle}} has reached 50% of its goal!',
      },
      {
        name: 'Campaign Update',
        triggerType: 'campaign_update',
        isActive: true,
        subject: 'New update from {{campaignTitle}}',
        body: 'Dear {{recipientLabel}}, there is a new update on {{campaignTitle}}.',
      },
      {
        name: 'Fundraiser Coaching',
        triggerType: 'fundraiser_coaching',
        isActive: true,
        subject: 'Tips to improve your campaign',
        body: 'Hi {{recipientLabel}}, here are practical tips to strengthen {{campaignTitle}} and reach more donors.',
      },
    ],
  })

  console.log('Seed complete.')
  console.log('\nDemo accounts:')
  console.log('  admin@fundbridge.com           -> admin (password: Admin@1234)')
  console.log('  campaignadmin@fundbridge.com   -> admin / Campaign Admin (password: Admin@1234)')
  console.log('  platform@fundbridge.com   -> platform_manager (password: Demo1234)')
  console.log('  fundraiser@example.com    -> fund_raiser (password: Demo1234)')
  console.log('  fundraiser2@example.com   -> fund_raiser (password: Demo1234)')
  console.log('  donor@example.com         -> donor (password: Demo1234)')
  console.log('  donee@example.com         -> donee (password: Demo1234)')
  console.log('  donee2@example.com        -> donee (password: Demo1234)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })