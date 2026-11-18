
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    onRequestPost,
    onRequest
} from "../functions/api/contact";

import {
    verifyTurnstile
} from "../functions/lib/turnstile";

// ============================================================
// MOCK CONFIGURATION
// ============================================================

vi.mock("../functions/lib/turnstile", () => ({
    verifyTurnstile: vi.fn()
}));

const mockedVerifyTurnstile = vi.mocked(verifyTurnstile);

const TEST_SECRET = "test-secret";
const TEST_TOKEN = "test-token";
const API_URL = "http://localhost/api/contact";

interface ApiResponse {
    success: boolean;
    message: string;
}

interface TestEnvironment {
    TURNSTILE_SECRET_KEY?: string;
}

// ============================================================
// TEST HELPERS
// ============================================================

function createValidSubmission(
    overrides: Record<string, unknown> = {}
) {
    return {
        name: "Camden",
        email: "camden@example.com",
        subject: "Employment opportunity",
        message: "Hello from the contact form.",
        turnstileToken: TEST_TOKEN,
        ...overrides
    };
}

function createRequest(
    body: BodyInit,
    method = "POST",
    contentType = "application/json"
): Request {
    return new Request(API_URL, {
        method,
        headers: {
            "Content-Type": contentType
        },
        body
    });
}

async function invokeHandler(
    request: Request,
    env: TestEnvironment = {
        TURNSTILE_SECRET_KEY: TEST_SECRET
    }
): Promise<Response> {
    const context = {
        request,
        env
    } as Parameters<typeof onRequestPost>[0];

    return await onRequestPost(context) as Response;
}

async function submit(
    data: unknown,
    env?: TestEnvironment
): Promise<Response> {
    const request = createRequest(
        JSON.stringify(data)
    );

    return invokeHandler(
        request,
        env ?? { TURNSTILE_SECRET_KEY: TEST_SECRET }
    );
}

async function readApiResponse(
    response: Response
): Promise<ApiResponse> {
    return await response.json() as ApiResponse;
}

beforeEach(() => {
    vi.resetAllMocks();
    mockedVerifyTurnstile.mockResolvedValue(true);
});

// ============================================================
// SUCCESSFUL SUBMISSIONS
// ============================================================

describe("contact handler - successful submissions", () => {

    it("returns HTTP 200 for a valid verified submission", async () => {
        const response = await submit(
            createValidSubmission()
        );

        expect(response.status).toBe(200);

        const body = await readApiResponse(response);

        expect(body.success).toBe(true);
    });

    it("returns a JSON response", async () => {
        const response = await submit(
            createValidSubmission()
        );

        expect(
            response.headers.get("content-type")
        ).toContain("application/json");
    });

    it("normalizes the name in the success response", async () => {
        const response = await submit(
            createValidSubmission({
                name: "   Camden   "
            })
        );

        const body = await readApiResponse(response);

        expect(body.message).toBe(
            "Received submission from Camden"
        );
    });

    it("passes the correct token and secret to verification", async () => {
        await submit(createValidSubmission());

        expect(mockedVerifyTurnstile).toHaveBeenCalledOnce();

        expect(mockedVerifyTurnstile).toHaveBeenCalledWith(
            TEST_TOKEN,
            TEST_SECRET
        );
    });

    it("accepts a valid freeform subject", async () => {
        const response = await submit(
            createValidSubmission({
                subject: "Question about your embedded systems work"
            })
        );

        expect(response.status).toBe(200);
    });

});

// ============================================================
// CONTENT TYPE VALIDATION
// ============================================================

describe("contact handler - content type", () => {

    it("rejects text/plain requests with HTTP 415", async () => {
        const request = createRequest(
            "hello",
            "POST",
            "text/plain"
        );

        const response = await invokeHandler(request);

        expect(response.status).toBe(415);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

    it("accepts application/json with charset", async () => {
        const request = createRequest(
            JSON.stringify(createValidSubmission()),
            "POST",
            "application/json; charset=utf-8"
        );

        const response = await invokeHandler(request);

        expect(response.status).toBe(200);
    });

    it("rejects requests without Content-Type", async () => {
        const request = new Request(API_URL, {
            method: "POST"
        });

        const response = await invokeHandler(request);

        expect(response.status).toBe(415);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

});

// ============================================================
// REQUEST BODY VALIDATION
// ============================================================

describe("contact handler - request body", () => {

    it("rejects malformed JSON with HTTP 400", async () => {
        const request = createRequest('{"name":');

        const response = await invokeHandler(request);

        expect(response.status).toBe(400);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

    it("rejects an empty body with HTTP 400", async () => {
        const request = createRequest("");

        const response = await invokeHandler(request);

        expect(response.status).toBe(400);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

    it("rejects an oversized body with HTTP 413", async () => {
        const request = createRequest(
            "A".repeat(16 * 1024 + 1)
        );

        const response = await invokeHandler(request);

        expect(response.status).toBe(413);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

    it("rejects malformed UTF-8 with HTTP 400", async () => {
        const bytes = new Uint8Array([
            0xC3,
            0x28
        ]);

        const request = createRequest(bytes);

        const response = await invokeHandler(request);

        expect(response.status).toBe(400);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

});

// ============================================================
// CONTACT DATA VALIDATION
// ============================================================

describe("contact handler - contact validation", () => {

    it("rejects invalid email addresses", async () => {
        const response = await submit(
            createValidSubmission({
                email: "camden@exam!ple.com"
            })
        );

        expect(response.status).toBe(400);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

    it("rejects short names", async () => {
        const response = await submit(
            createValidSubmission({
                name: "A"
            })
        );

        expect(response.status).toBe(400);
    });

    it("rejects short subjects", async () => {
        const response = await submit(
            createValidSubmission({
                subject: "Hi"
            })
        );

        expect(response.status).toBe(400);
    });

    it("rejects short messages", async () => {
        const response = await submit(
            createValidSubmission({
                message: "Short"
            })
        );

        expect(response.status).toBe(400);
    });

    it("rejects missing contact properties", async () => {
        const data = createValidSubmission();
        const { email, ...incomplete } = data;

        const response = await submit(incomplete);

        expect(response.status).toBe(400);
    });

    it("rejects non-object JSON", async () => {
        const response = await submit(42);

        expect(response.status).toBe(400);
    });

    it("rejects null JSON input", async () => {
        const response = await submit(null);

        expect(response.status).toBe(400);
    });

    it("does not verify Turnstile for invalid contact data", async () => {
        await submit(
            createValidSubmission({
                message: "Too short"
            })
        );

        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

});

// ============================================================
// TURNSTILE TOKEN VALIDATION
// ============================================================

describe("contact handler - Turnstile tokens", () => {

    it("rejects a missing token with HTTP 403", async () => {
        const data = createValidSubmission();
        const { turnstileToken, ...withoutToken } = data;

        const response = await submit(withoutToken);

        expect(response.status).toBe(403);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

    it.each([
        "",
        null,
        undefined,
        42,
        true,
        {},
        []
    ])(
        "rejects invalid token values: %j",
        async (token) => {
            const response = await submit(
                createValidSubmission({
                    turnstileToken: token
                })
            );

            expect(response.status).toBe(403);
            expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
        }
    );

    it("rejects tokens longer than 2048 characters", async () => {
        const response = await submit(
            createValidSubmission({
                turnstileToken: "A".repeat(2049)
            })
        );

        expect(response.status).toBe(403);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

    it("passes a 2048-character token to verification", async () => {
        const token = "A".repeat(2048);

        const response = await submit(
            createValidSubmission({
                turnstileToken: token
            })
        );

        expect(response.status).toBe(200);

        expect(mockedVerifyTurnstile).toHaveBeenCalledWith(
            token,
            TEST_SECRET
        );
    });

    it("rejects verification failures with HTTP 403", async () => {
        mockedVerifyTurnstile.mockResolvedValue(false);

        const response = await submit(
            createValidSubmission()
        );

        expect(response.status).toBe(403);

        const body = await readApiResponse(response);

        expect(body.success).toBe(false);
        expect(body.message).toBe(
            "Security verification failed"
        );
    });

});

// ============================================================
// ENVIRONMENT CONFIGURATION
// ============================================================

describe("contact handler - environment", () => {

    it("returns HTTP 503 when secret is missing", async () => {
        const response = await submit(
            createValidSubmission(),
            {}
        );

        expect(response.status).toBe(503);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

    it("returns HTTP 503 when secret is empty", async () => {
        const response = await submit(
            createValidSubmission(),
            { TURNSTILE_SECRET_KEY: "" }
        );

        expect(response.status).toBe(503);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    });

});

// ============================================================
// UNEXPECTED ERRORS
// ============================================================

describe("contact handler - unexpected errors", () => {

    it("returns HTTP 500 if verification throws", async () => {
        mockedVerifyTurnstile.mockRejectedValue(
            new Error("Verification service unavailable")
        );

        const response = await submit(
            createValidSubmission()
        );

        expect(response.status).toBe(500);

        const body = await readApiResponse(response);

        expect(body.success).toBe(false);
        expect(body.message).toBe("Unexpected Error");
    });

});

// ============================================================
// HTTP METHOD RESTRICTIONS
// ============================================================

describe("contact handler - HTTP methods", () => {

    it("returns HTTP 405 for unsupported methods", async () => {
        const response = await onRequest(
            {} as Parameters<typeof onRequest>[0]
        ) as Response;

        expect(response.status).toBe(405);
    });

    it("includes the Allow: POST header", async () => {
        const response = await onRequest(
            {} as Parameters<typeof onRequest>[0]
        ) as Response;

        expect(response.headers.get("Allow")).toBe("POST");
    });

    it("returns JSON for unsupported methods", async () => {
        const response = await onRequest(
            {} as Parameters<typeof onRequest>[0]
        ) as Response;

        expect(
            response.headers.get("content-type")
        ).toContain("application/json");

        const body = await readApiResponse(response);

        expect(body.success).toBe(false);
        expect(body.message).toBe("Method Not Allowed");
    });

});
