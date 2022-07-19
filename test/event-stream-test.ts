import { expect, test } from "@playwright/test";
import type { AppFixture, Fixture } from "./helpers/create-fixture.js";
import { createFixture, js } from "./helpers/create-fixture.js";
import { PlaywrightFixture } from "./helpers/playwright-fixture.js";

test.describe("check event-stream", () => {
  let fixture: Fixture;
  let appFixture: AppFixture;

  test.skip(process.env.ADAPTER !== "solid-start-node");

  test.beforeAll(async () => {
    fixture = await createFixture({
      files: {
        "src/routes/index.jsx": js`
          import { createEffect, createSignal, onCleanup, Show } from "solid-js";
          import server from "solid-start/server";
          
          function createEventStream({ url }, onMessage) {
            createEffect(() => {
              const eventSource = new EventSource(url);
          
              eventSource.addEventListener("chat", (event) => {
                onMessage(event);
              });
          
              onCleanup(() => eventSource.close());
            });
          }
          
          function eventStream(request, init) {
            let stream = new ReadableStream({
              start(controller) {
                let encoder = new TextEncoder();
                let send = (event, data) => {
                  controller.enqueue(encoder.encode("event: " + event + "\n"));
                  controller.enqueue(encoder.encode("data: " + data + "\n" + "\n"));
                };
                let cleanup = init(send);
                let closed = false;
                let close = () => {
                  if (closed) return;
                  cleanup();
                  closed = true;
                  request.signal.removeEventListener("abort", close);
                  controller.close();
                };
                request.signal.addEventListener("abort", close);
                if (request.signal.aborted) {
                  close();
                  return;
                }
              },
            });
            return new Response(stream, {
              headers: { "Content-Type": "text/event-stream" },
            });
          }
          
          export default function Page(){
            let [state, setState] = createSignal('test data');
            createEventStream(
              server(async () =>
                eventStream(server.request, (send) => {
                  send("chat", "Hello world");
                  setTimeout(() => {
                    send("chat", "Goodbye");
                  }, 5000);
                  return () => {};
                })
              ),
              (event) => {
                setState(event.data);
              }
            );
          
            return <h1 id="chat">{state()}</h1>;
          };
        `
      }
    });

    appFixture = await fixture.createServer();
  });

  test("should change the inner text of the h1 element when receiving data from the event stream", async ({
    page
  }) => {
    let app = new PlaywrightFixture(appFixture, page);
    await app.goto("/");

    expect(await page.locator("#chat").innerText()).toBe("Hello world");

    await page.waitForTimeout(6000);

    expect(await page.locator("#chat").innerText()).toBe("Goodbye");
  });
});
