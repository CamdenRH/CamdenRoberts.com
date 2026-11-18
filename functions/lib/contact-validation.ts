export interface ContactSubmission {
    name: string;
    email: string;
    subject: string;
    message: string;
}

export function validateSubmission(data: unknown): data is ContactSubmission {

    if (typeof data !== "object" || data === null) {
        return false;
    }

    if (Array.isArray(data)) {
        return false;
    }

    if (!("name" in data) || typeof data.name !== "string") {
        return false;
    }

    if (!("email" in data) || typeof data.email !== "string") {
        return false;
    }

    if (!("subject" in data) || typeof data.subject !== "string") {
        return false;
    }

    if (!("message" in data) || typeof data.message !== "string") {
        return false;
    }

    if(!isValidText(data.name, 2, 100)) {
        return false;
    }

    if(!isValidEmail(data.email)) {
        return false;
    }

    if(!isValidText(data.subject, 3, 150)) {
        return false;
    }

    if(!isValidText(data.message, 10, 5000)) {
        return false;
    }

    return true;
}

export function normalizeSubmission(submission: ContactSubmission): ContactSubmission {

    const normalized: ContactSubmission = {
        name: submission.name.trim(),
        email: submission.email.trim(),
        subject: submission.subject.trim(),
        message: submission.message.trim()
    };

    return normalized;
}

function isValidText(value: unknown, minLength: number, maxLength: number): value is string {

    if (typeof value !== "string") {
        return false;
    }

    const length = value.trim().length;

    if (length < minLength || length > maxLength) {
        return false;
    }

    return true;
}

function isValidEmail(input: unknown): input is string {
    if (typeof input !== "string") {
        return false;
    }

    const email = input.trim();

    if (email.length < 3 || email.length > 254) {
        return false;
    }

    const parts = email.split("@");

    if (parts.length !== 2) {
        return false;
    }

    const [local, domain] = parts;

    if (local.length > 64) {
        return false;
    }

    if (domain.split(".").some(label => label.length > 63)) {
        return false;
    }

    const emailPattern =
        /^[^\s@]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

    return emailPattern.test(email);
}