import type {ContactSubmission} from "./contact-validation";
import { Resend } from 'resend';

export async function sendContactEmail(email: ContactSubmission, key: string) {

    const resend = new Resend(key);

    const { data, error } = await resend.emails.send({
        from: 'Contact <contact@camdenroberts.com>',
        replyTo: email.email,
        to: ['camdencornetta@gmail.com'],
        subject: email.subject,
        text: 'New contact submission from: ' + email.name
            + '\nEmail Address: ' + email.email
            + '\nSubject: ' + email.subject
            + '\nMessage: \n'
            + email.message
    })

    if (error || !data) {
        throw new Error("Failed to send contact email");
    }

    return data.id;
}