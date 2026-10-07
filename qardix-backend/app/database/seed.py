import asyncio
from sqlalchemy import select
from app.database.connection import engine, AsyncSessionLocal, Base
from app.models.models import Company, User, AccountStatus, AppRole
from app.auth.passwords import get_password_hash


async def seed_database():
    async with engine.begin() as conn:
        # Ensure all tables exist
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # 1. Seed Companies
        demo_pharma_stmt = select(Company).where(Company.code == "DEMO-PHARMA")
        demo_pharma = (await session.execute(demo_pharma_stmt)).scalar_one_or_none()

        if not demo_pharma:
            demo_pharma = Company(
                name="Demo Pharma Pvt Ltd",
                code="DEMO-PHARMA",
                primary_contact="Rajesh Kumar",
                contact_email="contact@demopharma.com",
                contact_phone="+91 9876543210",
                notes="Primary active pilot partner company",
                status=AccountStatus.active,
            )
            session.add(demo_pharma)
            await session.commit()
            await session.refresh(demo_pharma)
            print("✓ Created Demo Pharma Pvt Ltd")

        sample_health_stmt = select(Company).where(Company.code == "SAMPLE-HEALTH")
        sample_health = (await session.execute(sample_health_stmt)).scalar_one_or_none()

        if not sample_health:
            sample_health = Company(
                name="Sample Healthcare Ltd",
                code="SAMPLE-HEALTH",
                primary_contact="Anil Verma",
                contact_email="contact@samplehealth.com",
                contact_phone="+91 9876543211",
                notes="Inactive test company for validation",
                status=AccountStatus.inactive,
            )
            session.add(sample_health)
            await session.commit()
            await session.refresh(sample_health)
            print("✓ Created Sample Healthcare Ltd")

        # 2. Seed Super Admin
        admin_stmt = select(User).where(User.email == "admin@qardix.ai")
        admin = (await session.execute(admin_stmt)).scalar_one_or_none()
        if not admin:
            admin = User(
                email="admin@qardix.ai",
                hashed_password=get_password_hash("Admin123!"),
                display_name="System Super Admin",
                role=AppRole.super_admin,
                status=AccountStatus.active,
                force_password_reset=False,
            )
            session.add(admin)
            print("✓ Created Super Admin (admin@qardix.ai)")

        # 3. Seed Marketing Manager for Demo Pharma
        mm_stmt = select(User).where(User.email == "mm@demopharma.com")
        mm = (await session.execute(mm_stmt)).scalar_one_or_none()
        if not mm:
            mm = User(
                email="mm@demopharma.com",
                hashed_password=get_password_hash("Mm12345!"),
                display_name="Priya Sharma (MM)",
                role=AppRole.marketing_manager,
                company_id=demo_pharma.id,
                status=AccountStatus.active,
                force_password_reset=False,
            )
            session.add(mm)
            print("✓ Created Marketing Manager (mm@demopharma.com)")

        # 4. Seed Doctors
        doc1_stmt = select(User).where(User.email == "doctor@demopharma.com")
        doc1 = (await session.execute(doc1_stmt)).scalar_one_or_none()
        if not doc1:
            doc1 = User(
                email="doctor@demopharma.com",
                hashed_password=get_password_hash("Doctor123!"),
                display_name="Dr. Vikram Mehta",
                role=AppRole.doctor,
                company_id=demo_pharma.id,
                specialty="Cardiology",
                status=AccountStatus.active,
                force_password_reset=False,
            )
            session.add(doc1)
            print("✓ Created Doctor (doctor@demopharma.com)")

        doc2_stmt = select(User).where(User.email == "doctor2@demopharma.com")
        doc2 = (await session.execute(doc2_stmt)).scalar_one_or_none()
        if not doc2:
            doc2 = User(
                email="doctor2@demopharma.com",
                hashed_password=get_password_hash("Doctor123!"),
                display_name="Dr. Ananya Roy",
                role=AppRole.doctor,
                company_id=demo_pharma.id,
                specialty="General Medicine",
                status=AccountStatus.active,
                force_password_reset=False,
            )
            session.add(doc2)
            print("✓ Created Doctor 2 (doctor2@demopharma.com)")

        await session.commit()
        print("🎉 Database seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(seed_database())
