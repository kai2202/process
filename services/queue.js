import PQueue from "p-queue";

export const queue = new PQueue({
  concurrency: 3,
  interval: 1000,
  intervalCap: 6 
});
