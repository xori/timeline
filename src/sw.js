self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "New post";
  const tag = data.tag || "default";

  event.waitUntil(
    self.registration.getNotifications({ tag }).then((existing) => {
      let body;
      if (existing.length > 0) {
        const prev = existing[0];
        const prevLines = (prev.data?.lines || [prev.body]);
        const lines = [...prevLines, data.body].slice(-4);
        const count = (prev.data?.count || 1) + 1;
        body = lines.join("\n");
        return self.registration.showNotification(title, {
          body: count > lines.length ? `and ${count - lines.length} more...\n${body}` : body,
          tag,
          renotify: true,
          data: { url: data.url || "/", lines, count },
        });
      }
      return self.registration.showNotification(title, {
        body: data.body || "",
        tag,
        renotify: true,
        data: { url: data.url || "/", lines: [data.body || ""], count: 1 },
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
