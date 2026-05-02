import { QueueTable } from "@/components/review/queue-table";
import { getCurrentUser } from "@/lib/current-user";
import { getReviewQueue } from "@/lib/review-repository";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const user = await getCurrentUser();
  const conversations = await getReviewQueue(user.workspaceId);

  return (
    <section className="px-8 py-7">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="mt-1 text-sm text-[#667085]">
          {conversations.length} seeded {conversations.length === 1 ? "conversation" : "conversations"}
        </p>
      </div>
      <QueueTable conversations={conversations} />
    </section>
  );
}
