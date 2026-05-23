from app.tasks.celery_app import celery_app


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_welcome_email(self, user_id: str, email: str, username: str) -> dict:
    try:
        from app.config import settings
        import smtplib
        from email.mime.text import MIMEText

        msg = MIMEText(
            f"Welcome to the platform, {username}!\n\n"
            f"Your account has been created successfully.\n\n"
            f"Get started by visiting our dashboard.\n\n"
            f"Best,\nThe Team"
        )
        msg["Subject"] = "Welcome to the Platform"
        msg["From"] = settings.smtp_user
        msg["To"] = email

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_user and settings.smtp_password:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)

        return {"status": "sent", "user_id": user_id, "email": email}
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset(self, email: str, token: str) -> dict:
    try:
        from app.config import settings
        import smtplib
        from email.mime.text import MIMEText

        reset_link = f"http://localhost:3000/reset-password?token={token}"

        msg = MIMEText(
            f"Password Reset Request\n\n"
            f"Click the link below to reset your password:\n{reset_link}\n\n"
            f"This link expires in 1 hour.\n\n"
            f"If you did not request this, please ignore this email.\n\n"
            f"Best,\nThe Team"
        )
        msg["Subject"] = "Password Reset Request"
        msg["From"] = settings.smtp_user
        msg["To"] = email

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_user and settings.smtp_password:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)

        return {"status": "sent", "email": email}
    except Exception as exc:
        raise self.retry(exc=exc)
