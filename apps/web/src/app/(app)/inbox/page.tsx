import { Suspense } from "react";
import { InboxView } from "./inbox-view";

export const metadata = { title: "Inbox" };

export default function Page() {
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
