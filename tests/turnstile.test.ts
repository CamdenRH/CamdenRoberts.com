
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
const TEST_HOSTNAME = "camdenroberts.com";

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

function mockSuccessfulVerification(
    hostname = TEST_HOSTNAME
) {
    return mockVerificationResponse({
        success: true,
        hostname
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

// ============================================================
// SUCCESSFUL VERIFICATION
// ============================================================

describe("verifyTurnstile - successful verification", () => {

    it("accepts a successful response with a matching hostname", async () => {
        mockSuccessfulVerification();

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(true);
    });

    it("sends a POST request to the Siteverify endpoint", async () => {
        const fetchMock = mockSuccessfulVerification();

        await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(fetchMock).toHaveBeenCalledOnce();

        const [url, options] = fetchMock.mock.calls[0];

        expect(url).toBe(SITEVERIFY_URL);
        expect(options.method).toBe("POST");
    });

    it("sends the correct Content-Type header", async () => {
        const fetchMock = mockSuccessfulVerification();

        await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        const [, options] = fetchMock.mock.calls[0];

        expect(options.headers).toEqual({
            "Content-Type": "application/json"
        });
    });

    it("sends the correct secret and token", async () => {
        const fetchMock = mockSuccessfulVerification();

        await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        const [, options] = fetchMock.mock.calls[0];

        expect(JSON.parse(options.body)).toEqual({
            secret: TEST_SECRET,
            response: TEST_TOKEN
        });
    });

    it("accepts a matching local testing hostname", async () => {
        mockSuccessfulVerification("example.com");

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            "example.com"
        );

        expect(result).toBe(true);
    });

});

// ============================================================
// HOSTNAME VERIFICATION
// ============================================================

describe("verifyTurnstile - hostname validation", () => {

    it("rejects an unexpected hostname", async () => {
        mockSuccessfulVerification("untrusted.example");

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(false);
    });

    it("rejects a missing hostname", async () => {
        mockVerificationResponse({
            success: true
        });

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(false);
    });

    it("rejects a null hostname", async () => {
        mockVerificationResponse({
            success: true,
            hostname: null
        });

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(false);
    });

    it("rejects an empty hostname", async () => {
        mockSuccessfulVerification("");

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(false);
    });

    it("rejects a subdomain when only the root domain is authorized", async () => {
        mockSuccessfulVerification("www.camdenroberts.com");

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(false);
    });

    it("rejects hostnames with different capitalization", async () => {
        mockSuccessfulVerification("CAMDENROBERTS.COM");

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(false);
    });

    it("does not accept test credentials' hostname as the production hostname", async () => {
        mockSuccessfulVerification("example.com");

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(false);
    });

});

// ============================================================
// FAILED VERIFICATION
// ============================================================

describe("verifyTurnstile - failed verification", () => {

    it("rejects a failed challenge even with a matching hostname", async () => {
        mockVerificationResponse({
            success: false,
            hostname: TEST_HOSTNAME
        });

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(false);
    });

    it("rejects a response without a success property", async () => {
        mockVerificationResponse({
            hostname: TEST_HOSTNAME
        });

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
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
    ])("rejects non-boolean success values: %j", async (success) => {
        mockVerificationResponse({
            success,
            hostname: TEST_HOSTNAME
        });

        const result = await verifyTurnstile(
            TEST_TOKEN,
            TEST_SECRET,
            TEST_HOSTNAME
        );

        expect(result).toBe(false);
    });

    it("rejects an expired or duplicate token", async () => {
        mockVerificationResponse({
            success: false,
            hostname: TEST_HOSTNAME,
            "error-codes": ["timeout-or-duplicate"]
        });

        expect(
            await verifyTurnstile(
                TEST_TOKEN,
                TEST_SECRET,
                TEST_HOSTNAME
            )
        ).toBe(false);
    });

    it("rejects an invalid secret", async () => {
        mockVerificationResponse({
            success: false,
            "error-codes": ["invalid-input-secret"]
        });

        expect(
            await verifyTurnstile(
                TEST_TOKEN,
                TEST_SECRET,
                TEST_HOSTNAME
            )
        ).toBe(false);
    });

});

// ============================================================
// SERVICE ERRORS
// ============================================================

describe("verifyTurnstile - service failures", () => {

    it.each([
        400,
        401,
        403,
        429,
        500,
        502,
        503
    ])("throws for HTTP %i", async (status) => {
        mockVerificationResponse(
            { success: false },
            status
        );

        await expect(
            verifyTurnstile(
                TEST_TOKEN,
                TEST_SECRET,
                TEST_HOSTNAME
            )
        ).rejects.toThrow(
            "Turnstile verification service failed"
        );
    });

    it("propagates network failures", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValue(
                new Error("Network unavailable")
            )
        );

        await expect(
            verifyTurnstile(
                TEST_TOKEN,
                TEST_SECRET,
                TEST_HOSTNAME
            )
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
            verifyTurnstile(
                TEST_TOKEN,
                TEST_SECRET,
                TEST_HOSTNAME
            )
        ).rejects.toThrow();
    });

});
