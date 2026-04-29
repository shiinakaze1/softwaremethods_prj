import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Lock } from "lucide-react";
import { LiveCampaignProgress } from "@/components/campaigns/live-campaign-progress";
import { ShareCampaignButton } from "@/components/campaigns/share-campaign-button";


export default async function CampaignDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      updates: { orderBy: { createdAt: "desc" } },
      donations: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      organiser: true,
    },
  });

  if (!campaign) {
    return <div className="p-8">Campaign not found.</div>;
  }

  const progress =
    campaign.targetAmount > 0
      ? Math.round((campaign.raisedAmount / campaign.targetAmount) * 100)
      : 0;

  return (
    <main className="max-w-4xl mx-auto p-8 space-y-8">
      <section>
        <h1 className="text-3xl font-bold">{campaign.title}</h1>
        <p className="text-gray-600 mt-2">{campaign.summary}</p>
        <p className="mt-4">{campaign.description}</p>
      </section>

      <LiveCampaignProgress
        campaignId={campaign.id}
        initialRaisedAmount={campaign.raisedAmount}
        targetAmount={campaign.targetAmount}
        initialDonorCount={campaign.donorCount}
      />

      <section>
        <h2 className="text-2xl font-semibold">Updates</h2>
        {campaign.updates.length === 0 ? (
          <p>No updates yet.</p>
        ) : (
          <div className="space-y-4">
            {campaign.updates.map((update) => (
              <div key={update.id} className="border p-4 rounded">
                <h3 className="font-semibold">{update.title}</h3>
                <p>{update.content}</p>
                <p className="text-sm text-gray-500">
                  {update.createdAt.toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Recent Donations</h2>
        {campaign.donations.length === 0 ? (
          <p>No donations yet.</p>
        ) : (
          <div className="space-y-3">
            {campaign.donations.map((donation) => (
              <div key={donation.id} className="border p-4 rounded">
                <p>
                  {donation.isAnonymous ? "Anonymous" : donation.donorName} donated $
                  {donation.amount.toFixed(2)}
                </p>
                {donation.message && <p>"{donation.message}"</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <ShareCampaignButton campaignId={campaign.id} campaignTitle={campaign.title} />

      {campaign.status === "locked" ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-5 py-4 text-destructive">
          <Lock className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">This campaign has been locked</p>
            <p className="text-sm opacity-80">
              This campaign has been flagged and is no longer accepting donations.
            </p>
          </div>
        </div>
      ) : (
        <Link
          href={`/campaign/${campaign.id}/donate`}
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded"
        >
          Donate Now
        </Link>
      )}
    </main>
  );
}