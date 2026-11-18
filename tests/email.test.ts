import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import { sendContactEmail } from "../functions/lib/email";

// Mock the Resend SDK before loading its implementation.
const mocks = vi.hoisted(() => ({
    send: vi.fn(),
    constructor: vi.fn()
}));

vi.mock("resend", () => ({
    Resend: class {
        emails = {
            send: mocks.send
        };

        constructor(key: string) {
            mocks.constructor(key);
        }
    }
}));

const TEST_API_KEY = "re_test_api_key";
const TEST_EMAIL_ID = "email_test_123";

function createValidSubmission() {
    return {
        name: "Camden",
        email: "camden@example.com",
        subject: "Employment opportunity",
        message: "Hello from the contact form."
    };
}

beforeEach(() => {
    vi.resetAllMocks();

    mocks.send.mockResolvedValue({
        data: { id: TEST_EMAIL_ID },
        error: null
    });
});

// ============================================================
// SUCCESSFUL EMAIL DELIVERY
// ============================================================

describe("sendContactEmail - successful requests", () => {

    it("returns the Resend email ID", async () => {
        const result = await sendContactEmail(
            createValidSubmission(),
            TEST_API_KEY
        );

        expect(result).toBe(TEST_EMAIL_ID);
    });

    it("constructs Resend with the supplied API key", async () => {
        await sendContactEmail(
            createValidSubmission(),
            TEST_API_KEY
        );

        expect(mocks.constructor).toHaveBeenCalledOnce();
        expect(mocks.constructor).toHaveBeenCalledWith(
            TEST_API_KEY
        );
    });

    it("makes exactly one email API request", async () => {
        await sendContactEmail(
            createValidSubmission(),
            TEST_API_KEY
        );

        expect(mocks.send).toHaveBeenCalledOnce();
    });

    it("uses the verified sender domain", async () => {
        await sendContactEmail(
            createValidSubmission(),
            TEST_API_KEY
        );

        const payload = mocks.send.mock.calls[0][0];

        expect(payload.from).toBe(
            "Contact <contact@camdenroberts.com>"
        );
    });

    it("delivers to the intended Gmail inbox", async () => {
        await sendContactEmail(
            createValidSubmission(),
            TEST_API_KEY
        );

        const payload = mocks.send.mock.calls[0][0];

        expect(payload.to).toEqual([
            "camdencornetta@gmail.com"
        ]);
    });

    it("sets Reply-To to the visitor's email", async () => {
        const submission = createValidSubmission();
        submission.email = "recruiter@example.org";

        await sendContactEmail(submission, TEST_API_KEY);

        const payload = mocks.send.mock.calls[0][0];

        expect(payload.replyTo).toBe(
            "recruiter@example.org"
        );

        expect(payload.from).toBe(
            "Contact <contact@camdenroberts.com>"
        );
    });

    it("preserves the visitor's subject", async () => {
        const submission = createValidSubmission();
        submission.subject =
            "Question about your embedded systems work";

        await sendContactEmail(submission, TEST_API_KEY);

        const payload = mocks.send.mock.calls[0][0];

        expect(payload.subject).toBe(submission.subject);
    });

    it("includes all submission fields in the text body", async () => {
        const submission = createValidSubmission();

        await sendContactEmail(submission, TEST_API_KEY);

        const payload = mocks.send.mock.calls[0][0];

        expect(payload.text).toContain(submission.name);
        expect(payload.text).toContain(submission.email);
        expect(payload.text).toContain(submission.subject);
        expect(payload.text).toContain(submission.message);
    });

    it("preserves multiline messages", async () => {
        const submission = createValidSubmission();

        submission.message =
            "First line\nSecond line\nThird line";

        await sendContactEmail(submission, TEST_API_KEY);

        const payload = mocks.send.mock.calls[0][0];

        expect(payload.text).toContain(
            "First line\nSecond line\nThird line"
        );
    });

    it("sends plain text rather than unescaped HTML", async () => {
        const submission = createValidSubmission();

        submission.message =
            "Please review <script>alert('test')</script>";

        await sendContactEmail(submission, TEST_API_KEY);

        const payload = mocks.send.mock.calls[0][0];

        expect(payload.text).toContain(submission.message);
        expect(payload.html).toBeUndefined();
    });

});

// ============================================================
// PROVIDER FAILURES
// ============================================================

describe("sendContactEmail - provider errors", () => {

    it("throws when Resend returns an error", async () => {
        mocks.send.mockResolvedValue({
            data: null,
            error: {
                name: "validation_error",
                message: "Invalid email request"
            }
        });

        await expect(
            sendContactEmail(
                createValidSubmission(),
                TEST_API_KEY
            )
        ).rejects.toThrow();
    });

    it("throws if Resend returns no data", async () => {
        mocks.send.mockResolvedValue({
            data: null,
            error: null
        });

        await expect(
            sendContactEmail(
                createValidSubmission(),
                TEST_API_KEY
            )
        ).rejects.toThrow();
    });

    it("propagates network errors", async () => {
        mocks.send.mockRejectedValue(
            new Error("Network unavailable")
        );

        await expect(
            sendContactEmail(
                createValidSubmission(),
                TEST_API_KEY
            )
        ).rejects.toThrow("Network unavailable");
    });

    it("does not report an email ID on failure", async () => {
        mocks.send.mockResolvedValue({
            data: null,
            error: {
                name: "rate_limit_exceeded",
                message: "Too many requests"
            }
        });

        await expect(
            sendContactEmail(
                createValidSubmission(),
                TEST_API_KEY
            )
        ).rejects.toBeDefined();
    });

});
