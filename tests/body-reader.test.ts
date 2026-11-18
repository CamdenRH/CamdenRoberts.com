
import { describe, it, expect } from "vitest";

import {
    readLimitedBody,
    InvalidEncodingError
} from "../functions/api/contact";

const encoder = new TextEncoder();
const MAX_BYTES = 16 * 1024;

// Builds a Request with individually controlled byte chunks.
// duplex is required by Node.js when using a streamed request body.
function createStreamRequest(
    chunks: Uint8Array[],
    onCancel?: () => void
): Request {
    let index = 0;

    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (index >= chunks.length) {
                controller.close();
                return;
            }

            controller.enqueue(chunks[index++]);
        },

        cancel() {
            onCancel?.();
        }
    });

    return new Request("http://localhost/api/contact", {
        method: "POST",
        body: stream,
        duplex: "half"
    } as RequestInit & { duplex: "half" });
}

function createTextRequest(...parts: string[]): Request {
    return createStreamRequest(parts.map(
        part => encoder.encode(part)
    ));
}

// ============================================================
// BASIC BODY READING
// ============================================================

describe("readLimitedBody - basic behavior", () => {

    it("returns an empty string for a missing body", async () => {
        const request = new Request(
            "http://localhost/api/contact",
            { method: "POST" }
        );

        expect(await readLimitedBody(request, MAX_BYTES)).toBe("");
    });

    it("reads a normal text body", async () => {
        const request = createTextRequest("Hello World");

        expect(await readLimitedBody(request, MAX_BYTES))
            .toBe("Hello World");
    });

    it("combines multiple chunks in the correct order", async () => {
        const request = createTextRequest(
            "Hello",
            " ",
            "from",
            " ",
            "Camden"
        );

        expect(await readLimitedBody(request, MAX_BYTES))
            .toBe("Hello from Camden");
    });

    it("handles empty chunks", async () => {
        const request = createTextRequest(
            "Hello",
            "",
            " World"
        );

        expect(await readLimitedBody(request, MAX_BYTES))
            .toBe("Hello World");
    });

});

// ============================================================
// BODY SIZE LIMITS
// ============================================================

describe("readLimitedBody - size limits", () => {

    it("accepts a body one byte below the limit", async () => {
        const text = "A".repeat(MAX_BYTES - 1);
        const request = createTextRequest(text);

        const result = await readLimitedBody(request, MAX_BYTES);

        expect(result).toBe(text);
    });

    it("accepts a body exactly at the limit", async () => {
        const text = "A".repeat(MAX_BYTES);
        const request = createTextRequest(text);

        const result = await readLimitedBody(request, MAX_BYTES);

        expect(result).toBe(text);
    });

    it("rejects a body one byte over the limit", async () => {
        const request = createTextRequest(
            "A".repeat(MAX_BYTES + 1)
        );

        expect(await readLimitedBody(request, MAX_BYTES))
            .toBeNull();
    });

    it("rejects an oversized body across multiple chunks", async () => {
        const request = createTextRequest(
            "A".repeat(8000),
            "B".repeat(8000),
            "C".repeat(1000)
        );

        expect(await readLimitedBody(request, MAX_BYTES))
            .toBeNull();
    });

    it("cancels the stream when the limit is exceeded", async () => {
        let cancelled = false;

        const request = createStreamRequest(
            [encoder.encode("A".repeat(MAX_BYTES + 1))],
            () => { cancelled = true; }
        );

        const result = await readLimitedBody(request, MAX_BYTES);

        expect(result).toBeNull();
        expect(cancelled).toBe(true);
    });

    it.each([
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY
    ])("rejects an invalid maxBytes value: %s", async (limit) => {
        const request = createTextRequest("Hello");

        await expect(
            readLimitedBody(request, limit)
        ).rejects.toBeInstanceOf(RangeError);
    });

});

// ============================================================
// UTF-8 DECODING
// ============================================================

describe("readLimitedBody - UTF-8", () => {

    it("correctly decodes multibyte characters", async () => {
        const text = "Hello, café 🌍";
        const request = createTextRequest(text);

        expect(await readLimitedBody(request, MAX_BYTES))
            .toBe(text);
    });

    it("decodes a character split across chunks", async () => {
        // UTF-8 encoding of AéB:
        // A = 0x41
        // é = 0xC3 0xA9
        // B = 0x42

        const request = createStreamRequest([
            new Uint8Array([0x41, 0xC3]),
            new Uint8Array([0xA9, 0x42])
        ]);

        expect(await readLimitedBody(request, MAX_BYTES))
            .toBe("AéB");
    });

    it("rejects an invalid UTF-8 sequence", async () => {
        const request = createStreamRequest([
            new Uint8Array([0xC3, 0x28])
        ]);

        await expect(
            readLimitedBody(request, MAX_BYTES)
        ).rejects.toBeInstanceOf(InvalidEncodingError);
    });

    it("rejects a truncated UTF-8 sequence", async () => {
        const request = createStreamRequest([
            new Uint8Array([0xE2, 0x82])
        ]);

        await expect(
            readLimitedBody(request, MAX_BYTES)
        ).rejects.toBeInstanceOf(InvalidEncodingError);
    });

    it("counts encoded bytes rather than characters", async () => {
        // Each é occupies two bytes in UTF-8.
        const text = "é".repeat(100);
        const request = createTextRequest(text);

        // 200 bytes exceeds this 199-byte limit.
        expect(await readLimitedBody(request, 199))
            .toBeNull();
    });

});

// ============================================================
// STREAM FAILURES
// ============================================================

describe("readLimitedBody - stream failures", () => {

    it("propagates unexpected stream errors", async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.error(new Error("Simulated stream failure"));
            }
        });

        const request = new Request(
            "http://localhost/api/contact",
            {
                method: "POST",
                body: stream,
                duplex: "half"
            } as RequestInit & { duplex: "half" }
        );

        await expect(
            readLimitedBody(request, MAX_BYTES)
        ).rejects.toThrow("Simulated stream failure");
    });

});
