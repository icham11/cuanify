import nodemailer from "nodemailer";

/**
 * Send invoice via email
 * @param to - Email address to send to
 * @param subject - Email subject
 * @param invoiceHtml - HTML content of invoice
 * @param invoiceFileName - Name of the invoice file for attachment
 */
export async function sendInvoiceEmail(
  to: string,
  subject: string,
  invoiceHtml: string,
  invoiceFileName: string,
): Promise<void> {
  // Check if email is configured
  if (
    !process.env.EMAIL_HOST ||
    !process.env.EMAIL_PORT ||
    !process.env.EMAIL_USER ||
    !process.env.EMAIL_PASSWORD ||
    !process.env.EMAIL_FROM
  ) {
    console.warn("⚠️ Email configuration not set. Invoice email not sent.");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Convert HTML to buffer for attachment
    const invoiceBuffer = Buffer.from(invoiceHtml, "utf-8");

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html: `
        <h2>Halo,</h2>
        <p>Terima kasih telah melakukan transaksi. Invoice Anda terlampir di email ini.</p>
        <p>Jika ada pertanyaan, silakan hubungi kami.</p>
        <br>
        <p>Salam,<br>Tim Crumbella</p>
      `,
      attachments: [
        {
          filename: invoiceFileName,
          content: invoiceBuffer,
          contentType: "text/html",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Invoice email sent to ${to}`);
  } catch (error) {
    console.error("❌ Failed to send invoice email:", error);
    // Don't throw - email is optional
  }
}

