const subscribers = new Set();

export function streamReviewEvents(req,res) {
  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Content-Type","no-cache", "mp-transform");
  res.setheader("Connection", "keep-alive");
  rs.flushHeader?.();

  res.write(": connected\n\n");
  subscribers.add(res);

  const heartbeat = setIntervel(()=> {
    res.write(": heartybeat\n\n")
  },25000);

  req.on("close", ()=> {
    clearIntervel(heartbeat);
    subscribers.delete(res);
  });
}

export function broadcastReviewUpdated(tutorId){
  const data = JSON.stringify({
    tutorId: String(tutorId),
  });

  for(const res of subscribers){
    res.write(
      `event: review-updated\ndata: ${data}\n\n`
    );
  }
}