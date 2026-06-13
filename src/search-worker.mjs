import { searchSolutions } from "./search.mjs";

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type !== "compute") {
    return;
  }

  try {
    const { quartzList, slotGrid, requirements, options } = message.payload;
    const result = searchSolutions(quartzList, slotGrid, requirements, options);
    self.postMessage({ type: "done", jobId: message.jobId, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      jobId: message.jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
