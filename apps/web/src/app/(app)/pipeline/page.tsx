import { Suspense } from "react";
import { PipelineBoard } from "./board";

export const metadata = { title: "Pipeline" };

export default function Page() {
  return (
    <Suspense>
      <PipelineBoard />
    </Suspense>
  );
}
