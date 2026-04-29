const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

const CAMPAIGN_UPDATE_BODY = `Hello,

Thank you for supporting {{campaignTitle}}.

We’ve just shared a new campaign update.

{{campaignUpdateTitle}}

{{campaignUpdateContent}}

So far, the campaign has raised {{raisedAmount}} out of {{targetAmount}}, with support from {{donorCount}} supporters.

We truly appreciate your support and will continue to keep you updated.

Warm regards,
{{fundRaiserName}}`

const CAMPAIGN_UPDATE_SUBJECT = "New update for {{campaignTitle}}: {{campaignUpdateTitle}}"

const NEW_DONATION_ALERT_SUBJECT = "New donation received for {{campaignTitle}}"
const NEW_DONATION_ALERT_BODY = `Hello {{fundRaiserName}},

You’ve received a new donation for {{campaignTitle}}.

Current campaign progress:
- Raised so far: {{raisedAmount}}
- Goal: {{targetAmount}}
- Supporters: {{donorCount}}

Please log in to view the latest campaign activity.

Warm regards,
FundBridge`

async function findFirstByTriggerTypes(triggerTypes) {
  return prisma.emailAutomationRule.findFirst({
    where: {
      triggerType: {
        in: triggerTypes,
      },
    },
    orderBy: {
      triggerType: "asc",
    },
  })
}

async function patchCampaignUpdateRule() {
  const existing = await findFirstByTriggerTypes(["campaign_update", "manual_update"])

  if (existing) {
    await prisma.emailAutomationRule.update({
      where: { id: existing.id },
      data: {
        name: existing.name || "Campaign update",
        triggerType: existing.triggerType || "campaign_update",
        subject: existing.subject || CAMPAIGN_UPDATE_SUBJECT,
        body: CAMPAIGN_UPDATE_BODY,
      },
    })

    console.log(`Updated campaign update workflow (${existing.triggerType})`)
    return
  }

  await prisma.emailAutomationRule.create({
    data: {
      name: "Campaign update",
      triggerType: "campaign_update",
      isActive: false,
      subject: CAMPAIGN_UPDATE_SUBJECT,
      body: CAMPAIGN_UPDATE_BODY,
    },
  })

  console.log("Created campaign update workflow")
}

async function patchNewDonationAlertRule() {
  const existingNewDonationAlert = await findFirstByTriggerTypes(["new_donation_alert"])
  if (existingNewDonationAlert) {
    await prisma.emailAutomationRule.update({
      where: { id: existingNewDonationAlert.id },
      data: {
        name: "New donation alert",
        triggerType: "new_donation_alert",
        subject: existingNewDonationAlert.subject || NEW_DONATION_ALERT_SUBJECT,
        body: existingNewDonationAlert.body || NEW_DONATION_ALERT_BODY,
      },
    })

    console.log("Updated existing new_donation_alert workflow")
    return
  }

  const existingCoaching = await findFirstByTriggerTypes(["fundraiser_coaching"])
  if (existingCoaching) {
    await prisma.emailAutomationRule.update({
      where: { id: existingCoaching.id },
      data: {
        name: "New donation alert",
        triggerType: "new_donation_alert",
        subject: NEW_DONATION_ALERT_SUBJECT,
        body: NEW_DONATION_ALERT_BODY,
      },
    })

    console.log("Converted fundraiser_coaching workflow to new_donation_alert")
    return
  }

  await prisma.emailAutomationRule.create({
    data: {
      name: "New donation alert",
      triggerType: "new_donation_alert",
      isActive: false,
      subject: NEW_DONATION_ALERT_SUBJECT,
      body: NEW_DONATION_ALERT_BODY,
    },
  })

  console.log("Created new_donation_alert workflow")
}

async function main() {
  await patchCampaignUpdateRule()
  await patchNewDonationAlertRule()

  const rows = await prisma.emailAutomationRule.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      triggerType: true,
      isActive: true,
      subject: true,
    },
  })

  console.log("\nCurrent emailAutomationRule rows:")
  console.table(rows)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
