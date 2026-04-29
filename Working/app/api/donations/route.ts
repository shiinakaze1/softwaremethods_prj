import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { EmailTemplate } from "@/app/entity/EmailTemplate"

type WorkflowResult =
  | { attempted: false; deliveredCount: 0; reason: string }
  | { attempted: true; deliveredCount: number; messageId?: string }

const MILESTONE_THRESHOLDS = [25, 50, 75, 100] as const

function buildTemplateReplacements(input: {
  campaignTitle: string
  targetAmount: number
  raisedAmount: number
  donorCount: number
  fundRaiserName: string
  recipientLabel?: string
  milestonePercent?: number
}) {
  return {
    campaignTitle: input.campaignTitle,
    targetAmount: Number(input.targetAmount || 0).toLocaleString(),
    raisedAmount: Number(input.raisedAmount || 0).toLocaleString(),
    donorCount: Number(input.donorCount || 0).toLocaleString(),
    fundRaiserName: input.fundRaiserName,
    recipientLabel: input.recipientLabel || "supporter",
    milestonePercent: input.milestonePercent,
  }
}

function mapRuleKey(triggerType: string): "thank_you" | "milestone" | "new_donation_alert" | null {
  if (triggerType === "donation_received" || triggerType === "thank_you") {
    return "thank_you"
  }

  if (triggerType === "milestone_50" || triggerType === "milestone") {
    return "milestone"
  }

  if (triggerType === "new_donation_alert" || triggerType === "donation_alert") {
    return "new_donation_alert"
  }

  return null
}

function getNewlyReachedMilestone(input: {
  previousRaisedAmount: number
  nextRaisedAmount: number
  targetAmount: number
}): number | null {
  if (input.targetAmount <= 0) return null

  const previousPercent = (input.previousRaisedAmount / input.targetAmount) * 100
  const nextPercent = (input.nextRaisedAmount / input.targetAmount) * 100

  const newlyReached = MILESTONE_THRESHOLDS.filter(
    (threshold) => previousPercent < threshold && nextPercent >= threshold
  )

  if (newlyReached.length === 0) return null

  return newlyReached[newlyReached.length - 1]
}

/**
 * THANK YOU WORKFLOW
 * -----------------
 * Trigger condition:
 * - A donation has just been completed.
 *
 * What this function does:
 * - Finds the active thank-you workflow rule/template.
 * - Sends the thank-you email to the donor who just donated.
 * - Uses the existing fund-raiser email send route so emailLog is persisted there.
 */
async function triggerThankYouWorkflow(input: {
  request: NextRequest
  campaignId: string
  campaignTitle: string
  targetAmount: number
  raisedAmount: number
  donorCount: number
  fundRaiserName: string
  donorEmail: string | null
  workflowRuleId?: string | null
}) : Promise<WorkflowResult> {
  if (!input.donorEmail) {
    return {
      attempted: false,
      deliveredCount: 0,
      reason: "The completed donation does not have a valid donor email address.",
    }
  }

  const workflowRule =
    input.workflowRuleId
      ? await prisma.emailAutomationRule.findFirst({
          where: {
            id: input.workflowRuleId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            triggerType: true,
            subject: true,
            body: true,
          },
        })
      : await prisma.emailAutomationRule.findFirst({
          where: {
            triggerType: {
              in: ["donation_received", "thank_you"],
            },
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            triggerType: true,
            subject: true,
            body: true,
          },
        })

  if (!workflowRule) {
    return {
      attempted: false,
      deliveredCount: 0,
      reason: "Thank-you workflow is not enabled.",
    }
  }

  const template = new EmailTemplate({
    id: workflowRule.id,
    ruleKey: mapRuleKey(workflowRule.triggerType) || "thank_you",
    label: workflowRule.name,
    description: "Automatic donation thank-you email template.",
    subjectTemplate: workflowRule.subject,
    bodyTemplate: workflowRule.body,
    updatedAt: undefined,
  })

  const replacements = buildTemplateReplacements({
    campaignTitle: input.campaignTitle,
    targetAmount: input.targetAmount,
    raisedAmount: input.raisedAmount,
    donorCount: input.donorCount,
    fundRaiserName: input.fundRaiserName,
    recipientLabel: "donor",
  })

  const subject = template.renderSubject(replacements)
  const body = template.renderBody(replacements)

  const sendResponse = await fetch(`${input.request.nextUrl.origin}/api/fund-raiser/email-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [input.donorEmail],
      subject,
      text: body,
      campaignId: input.campaignId,
      campaignTitle: input.campaignTitle,
      triggerKey: "thank_you",
      templateId: workflowRule.id,
    }),
    cache: "no-store",
  })

  const sendPayload = await sendResponse.json().catch(() => null)

  if (!sendResponse.ok) {
    throw new Error(
      (sendPayload && typeof sendPayload.error === "string" && sendPayload.error) ||
        "Thank-you workflow email failed to send."
    )
  }

  return {
    attempted: true,
    deliveredCount:
      sendPayload && typeof sendPayload.deliveredCount === "number" ? sendPayload.deliveredCount : 1,
    messageId:
      sendPayload && typeof sendPayload.messageId === "string" ? sendPayload.messageId : undefined,
  }
}


/**
 * NEW DONATION ALERT WORKFLOW
 * ---------------------------
 * Trigger condition:
 * - A donation has just been completed.
 *
 * What this function does:
 * - Finds the active new donation alert workflow rule/template.
 * - Sends a notification email to the fund raiser.
 * - Uses the existing fund-raiser email send route so emailLog is persisted there.
 */
async function triggerNewDonationAlertWorkflow(input: {
  request: NextRequest
  campaignId: string
  campaignTitle: string
  targetAmount: number
  raisedAmount: number
  donorCount: number
  fundRaiserName: string
  fundRaiserEmail: string | null
}) : Promise<WorkflowResult> {
  if (!input.fundRaiserEmail) {
    return {
      attempted: false,
      deliveredCount: 0,
      reason: "The fund raiser account does not have a valid email address.",
    }
  }

  const workflowRule = await prisma.emailAutomationRule.findFirst({
    where: {
      triggerType: {
        in: ["new_donation_alert", "donation_alert"],
      },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      triggerType: true,
      subject: true,
      body: true,
    },
  })

  if (!workflowRule) {
    return {
      attempted: false,
      deliveredCount: 0,
      reason: "New donation alert workflow is not enabled.",
    }
  }

  const template = new EmailTemplate({
    id: workflowRule.id,
    ruleKey: mapRuleKey(workflowRule.triggerType) || "new_donation_alert",
    label: workflowRule.name,
    description: "Automatic new donation alert email template.",
    subjectTemplate: workflowRule.subject,
    bodyTemplate: workflowRule.body,
    updatedAt: undefined,
  })

  const replacements = buildTemplateReplacements({
    campaignTitle: input.campaignTitle,
    targetAmount: input.targetAmount,
    raisedAmount: input.raisedAmount,
    donorCount: input.donorCount,
    fundRaiserName: input.fundRaiserName,
    recipientLabel: "fund raiser",
  })

  const subject = template.renderSubject(replacements)
  const body = template.renderBody(replacements)

  const sendResponse = await fetch(`${input.request.nextUrl.origin}/api/fund-raiser/email-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [input.fundRaiserEmail],
      subject,
      text: body,
      campaignId: input.campaignId,
      campaignTitle: input.campaignTitle,
      triggerKey: "new_donation_alert",
      templateId: workflowRule.id,
    }),
    cache: "no-store",
  })

  const sendPayload = await sendResponse.json().catch(() => null)

  if (!sendResponse.ok) {
    throw new Error(
      (sendPayload && typeof sendPayload.error === "string" && sendPayload.error) ||
        "New donation alert workflow email failed to send."
    )
  }

  return {
    attempted: true,
    deliveredCount:
      sendPayload && typeof sendPayload.deliveredCount === "number" ? sendPayload.deliveredCount : 1,
    messageId:
      sendPayload && typeof sendPayload.messageId === "string" ? sendPayload.messageId : undefined,
  }
}

/**
 * MILESTONE WORKFLOW
 * ------------------
 * Trigger condition:
 * - The donation caused the campaign to cross a milestone threshold
 *   (25%, 50%, 75%, or 100%).
 *
 * What this function does:
 * - Detects the newly reached milestone.
 * - Finds the active milestone workflow rule/template.
 * - Sends the milestone email to all campaign supporters with valid emails.
 * - Uses the existing fund-raiser email send route so emailLog is persisted there.
 */
async function triggerMilestoneWorkflow(input: {
  request: NextRequest
  campaignId: string
  campaignTitle: string
  targetAmount: number
  previousRaisedAmount: number
  raisedAmount: number
  donorCount: number
  fundRaiserName: string
  workflowRuleId?: string | null
}) : Promise<WorkflowResult> {
  const milestonePercent = getNewlyReachedMilestone({
    previousRaisedAmount: input.previousRaisedAmount,
    nextRaisedAmount: input.raisedAmount,
    targetAmount: input.targetAmount,
  })

  if (!milestonePercent) {
    return {
      attempted: false,
      deliveredCount: 0,
      reason: "This donation did not cross a new campaign milestone.",
    }
  }

  const workflowRule =
    input.workflowRuleId
      ? await prisma.emailAutomationRule.findFirst({
          where: {
            id: input.workflowRuleId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            triggerType: true,
            subject: true,
            body: true,
          },
        })
      : await prisma.emailAutomationRule.findFirst({
          where: {
            triggerType: {
              in: ["milestone_50", "milestone"],
            },
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            triggerType: true,
            subject: true,
            body: true,
          },
        })

  if (!workflowRule) {
    return {
      attempted: false,
      deliveredCount: 0,
      reason: "Milestone workflow is not enabled.",
    }
  }

  const recipients = Array.from(
    new Set(
      (
        await prisma.donation.findMany({
          where: {
            campaignId: input.campaignId,
            status: "completed",
            donorEmail: {
              not: null,
            },
          },
          select: {
            donorEmail: true,
          },
        })
      )
        .map((donation) => donation.donorEmail?.trim())
        .filter((email): email is string => Boolean(email))
    )
  )

  if (recipients.length === 0) {
    return {
      attempted: false,
      deliveredCount: 0,
      reason: "No supporter email recipients are available for this campaign yet.",
    }
  }

  const template = new EmailTemplate({
    id: workflowRule.id,
    ruleKey: mapRuleKey(workflowRule.triggerType) || "milestone",
    label: workflowRule.name,
    description: "Automatic campaign milestone update email template.",
    subjectTemplate: workflowRule.subject,
    bodyTemplate: workflowRule.body,
    updatedAt: undefined,
  })

  const replacements = buildTemplateReplacements({
    campaignTitle: input.campaignTitle,
    targetAmount: input.targetAmount,
    raisedAmount: input.raisedAmount,
    donorCount: input.donorCount,
    fundRaiserName: input.fundRaiserName,
    recipientLabel: "supporter",
    milestonePercent,
  })

  const subject = template.renderSubject(replacements)
  const body = template.renderBody(replacements)

  const sendResponse = await fetch(`${input.request.nextUrl.origin}/api/fund-raiser/email-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: recipients,
      subject,
      text: body,
      campaignId: input.campaignId,
      campaignTitle: input.campaignTitle,
      triggerKey: "milestone",
      templateId: workflowRule.id,
    }),
    cache: "no-store",
  })

  const sendPayload = await sendResponse.json().catch(() => null)

  if (!sendResponse.ok) {
    throw new Error(
      (sendPayload && typeof sendPayload.error === "string" && sendPayload.error) ||
        "Milestone workflow email failed to send."
    )
  }

  return {
    attempted: true,
    deliveredCount:
      sendPayload && typeof sendPayload.deliveredCount === "number"
        ? sendPayload.deliveredCount
        : recipients.length,
    messageId:
      sendPayload && typeof sendPayload.messageId === "string" ? sendPayload.messageId : undefined,
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const donations = await prisma.donation.findMany({
    where: { donorId: session.id },
    include: {
      campaign: {
        select: {
          id: true,
          title: true,
          category: true,
          raisedAmount: true,
          targetAmount: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ donations });
}

export async function POST(request: NextRequest) {
  const {
    campaignId,
    amount,
    isAnonymous,
    message,
    donorName,
    donorEmail,
  } = await request.json()

  const donationAmount = Number(amount)

  if (!campaignId || !donationAmount || donationAmount <= 0) {
    return NextResponse.json(
      { error: "Invalid donation data" },
      { status: 400 }
    )
  }

  const session = await getSession()

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      title: true,
      targetAmount: true,
      raisedAmount: true,
      donorCount: true,
      organiser: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  })

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    )
  }

  if (campaign.status === 'locked') {
    return NextResponse.json(
      { error: "This campaign has been locked and cannot accept donations." },
      { status: 403 }
    );
  }

  const finalDonorName = isAnonymous
    ? "Anonymous"
    : session
    ? `${session.firstName} ${session.lastName}`
    : donorName || "Guest Donor"

  const finalDonorEmail = session ? session.email : donorEmail || null

  const donation = await prisma.donation.create({
    data: {
      campaignId,
      donorId: session?.id ?? null,
      donorName: finalDonorName,
      donorEmail: finalDonorEmail,
      amount: donationAmount,
      isAnonymous: isAnonymous ?? false,
      message: message || null,
      status: "completed",
    },
  })

  const previousRaisedAmount = Number(campaign.raisedAmount || 0)
  const previousDonorCount = Number(campaign.donorCount || 0)
  const nextRaisedAmount = previousRaisedAmount + donationAmount
  const nextDonorCount = previousDonorCount + 1

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      raisedAmount: { increment: donationAmount },
      donorCount: { increment: 1 },
    },
  })

  let thankYouWorkflow: WorkflowResult
  let newDonationAlertWorkflow: WorkflowResult
  let milestoneWorkflow: WorkflowResult

  try {
    // ============================================================
    // THANK YOU EMAIL WORKFLOW
    // ============================================================
    // Triggered immediately after a successful completed donation.
    // Sends only to the donor who just donated.
    thankYouWorkflow = await triggerThankYouWorkflow({
      request,
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      targetAmount: Number(campaign.targetAmount || 0),
      raisedAmount: nextRaisedAmount,
      donorCount: nextDonorCount,
      fundRaiserName: `${campaign.organiser.firstName} ${campaign.organiser.lastName}`.trim() || "Fund Raiser",
      donorEmail: finalDonorEmail,
    })
  } catch (error) {
    thankYouWorkflow = {
      attempted: false,
      deliveredCount: 0,
      reason: error instanceof Error ? error.message : "Thank-you workflow email failed.",
    }
  }

  try {
    // ============================================================
    // NEW DONATION ALERT WORKFLOW
    // ============================================================
    // Triggered immediately after a successful completed donation.
    // Sends only to the fund raiser who owns the campaign.
    newDonationAlertWorkflow = await triggerNewDonationAlertWorkflow({
      request,
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      targetAmount: Number(campaign.targetAmount || 0),
      raisedAmount: nextRaisedAmount,
      donorCount: nextDonorCount,
      fundRaiserName: `${campaign.organiser.firstName} ${campaign.organiser.lastName}`.trim() || "Fund Raiser",
      fundRaiserEmail: campaign.organiser.email || null,
    })
  } catch (error) {
    newDonationAlertWorkflow = {
      attempted: false,
      deliveredCount: 0,
      reason: error instanceof Error ? error.message : "New donation alert workflow email failed.",
    }
  }

  try {
    // ============================================================
    // MILESTONE UPDATE WORKFLOW
    // ============================================================
    // Triggered only if this donation caused the campaign to cross
    // a new milestone threshold (25%, 50%, 75%, 100%).
    // Sends to campaign supporters with valid email addresses.
    milestoneWorkflow = await triggerMilestoneWorkflow({
      request,
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      targetAmount: Number(campaign.targetAmount || 0),
      previousRaisedAmount,
      raisedAmount: nextRaisedAmount,
      donorCount: nextDonorCount,
      fundRaiserName: `${campaign.organiser.firstName} ${campaign.organiser.lastName}`.trim() || "Fund Raiser",
    })
  } catch (error) {
    milestoneWorkflow = {
      attempted: false,
      deliveredCount: 0,
      reason: error instanceof Error ? error.message : "Milestone workflow email failed.",
    }
  }

  return NextResponse.json({
    success: true,
    donationId: donation.id,
    confirmationNumber: `DON-${donation.id.slice(-8).toUpperCase()}`,
    thankYouWorkflow,
    newDonationAlertWorkflow,
    milestoneWorkflow,
  })
}
