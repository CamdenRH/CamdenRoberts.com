
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    verifyTurnstile
} from "../functions/lib/turnstile";

const SITEVERIFY_URL =
    "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const TEST_TOKEN = "test-turnstile-token";
const TEST_SECRET = "test-turnstile-secret";

function mockVerificationResponse(
    body: unknown,
    status = 200
) {
    const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
            status,
            headers: {
                "Content-Type": "application/json"
            }
        })
    );

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

// ============================================================
// SUCCESSFUL VERIFICATION
// ============================================================

describe("verifyTurnstile - successful verification", () => {

    it("returns true when Cloudflare approves the token", async () => {
        mockVerificationResponse({
            success: true
        });

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET
        );

        expect(result).toBe(true);
    });

    it("sends a POST request to the Siteverify endpoint", async () => {
        const fetchMock = mockVerificationResponse({
            success: true
        });

        await verifyTurnstile(TEST_TOKEN, TEST_SECRET);

        expect(fetchMock).toHaveBeenCalledOnce();

        const [url, options] = fetchMock.mock.calls[0];

        expect(url).toBe(SITEVERIFY_URL);
        expect(options.method).toBe("POST");
    });

    it("sends the correct Content-Type header", async () => {
        const fetchMock = mockVerificationResponse({
            success: true
        });

        await verifyTurnstile(TEST_TOKEN, TEST_SECRET);

        const [, options] = fetchMock.mock.calls[0];

        expect(options.headers).toEqual({
            "Content-Type": "application/json"
        });
    });

    it("sends the secret and token in the request body", async () => {
        const fetchMock = mockVerificationResponse({
            success: true
        });

        await verifyTurnstile(TEST_TOKEN, TEST_SECRET);

        const [, options] = fetchMock.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body).toEqual({
            secret: TEST_SECRET,
            response: TEST_TOKEN
        });
    });

});

// ============================================================
// FAILED VERIFICATION
// ============================================================

describe("verifyTurnstile - failed verification", () => {

    it("returns false when Cloudflare rejects the token", async () => {
        mockVerificationResponse({
            success: false
        });

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET
        );

        expect(result).toBe(false);
    });

    it("returns false when success is missing", async () => {
        mockVerificationResponse({
            "error-codes": ["invalid-input-response"]
        });

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET
        );

        expect(result).toBe(false);
    });

    it.each([
        null,
        0,
        1,
        "true",
        "false",
        {}
    ])(
        "rejects a non-boolean success value: %j",
        async (value) => {
            mockVerificationResponse({
                success: value
            });

            const result = await verifyTurnstile(
                TEST_TOKEN,
                TEST_SECRET
            );

            expect(result).toBe(false);
        }
    );

    it("rejects an expired token", async () => {
        mockVerificationResponse({
            success: false,
            "error-codes": ["timeout-or-duplicate"]
        });

        expect(
            await verifyTurnstile(TEST_TOKEN, TEST_SECRET)
        ).toBe(false);
    });

    it("rejects an invalid secret", async () => {
        mockVerificationResponse({
            success: false,
            "error-codes": ["invalid-input-secret"]
        });

        expect(
            await verifyTurnstile(TEST_TOKEN, TEST_SECRET)
        ).toBe(false);
    });

});

// ============================================================
// VERIFICATION SERVICE ERRORS
// ============================================================

describe("verifyTurnstile - service errors", () => {

    it.each([
        400,
        401,
        403,
        429,
        500,
        502,
        503
    ])(
        "throws when Cloudflare returns HTTP %i",
        async (status) => {
            mockVerificationResponse(
                { success: false },
                status
            );

            await expect(
                verifyTurnstile(TEST_TOKEN, TEST_SECRET)
            ).rejects.toThrow(
                "Turnstile verification service failed"
            );
        }
    );

    it("propagates network failures", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValue(
                new Error("Network unavailable")
            )
        );

        await expect(
            verifyTurnstile(TEST_TOKEN, TEST_SECRET)
        ).rejects.toThrow("Network unavailable");
    });

    it("rejects malformed JSON responses", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response("not valid json", {
                    status: 200
                })
            )
        );

        await expect(
            verifyTurnstile(TEST_TOKEN, TEST_SECRET)
        ).rejects.toThrow();
    });

});

