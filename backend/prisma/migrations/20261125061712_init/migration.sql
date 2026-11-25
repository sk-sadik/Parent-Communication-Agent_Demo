-- CreateEnum
CREATE TYPE "language" AS ENUM ('en', 'te');

-- CreateEnum
CREATE TYPE "activation_role" AS ENUM ('guardian', 'teacher');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('present', 'absent', 'late');

-- CreateEnum
CREATE TYPE "announcement_status" AS ENUM ('draft', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "escalation_status" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('guardian', 'teacher', 'system');

-- CreateTable
CREATE TABLE "institute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assigned_class" TEXT NOT NULL,
    "telegram_chat_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "roll_number" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" "language" NOT NULL DEFAULT 'en',
    "telegram_chat_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_student_link" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "is_fee_contact" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_student_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_code" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "activation_role" NOT NULL,
    "guardian_id" TEXT,
    "teacher_id" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "attendance_status" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "test_name" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "announcement_status" NOT NULL DEFAULT 'draft',
    "created_by_teacher_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "escalation_status" NOT NULL DEFAULT 'open',
    "teacher_reply" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_telegram_chat_id_key" ON "teacher"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "teacher_institute_id_assigned_class_idx" ON "teacher"("institute_id", "assigned_class");

-- CreateIndex
CREATE INDEX "student_institute_id_idx" ON "student"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_institute_id_class_roll_number_key" ON "student"("institute_id", "class", "roll_number");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_telegram_chat_id_key" ON "guardian"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "guardian_institute_id_idx" ON "guardian"("institute_id");

-- CreateIndex
CREATE INDEX "guardian_student_link_student_id_is_fee_contact_idx" ON "guardian_student_link"("student_id", "is_fee_contact");

-- CreateIndex
CREATE INDEX "guardian_student_link_institute_id_idx" ON "guardian_student_link"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_student_link_guardian_id_student_id_key" ON "guardian_student_link"("guardian_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "activation_code_code_key" ON "activation_code"("code");

-- CreateIndex
CREATE INDEX "activation_code_institute_id_role_idx" ON "activation_code"("institute_id", "role");

-- CreateIndex
CREATE INDEX "activation_code_expires_at_idx" ON "activation_code"("expires_at");

-- CreateIndex
CREATE INDEX "attendance_institute_id_date_idx" ON "attendance"("institute_id", "date");

-- CreateIndex
CREATE INDEX "attendance_student_id_status_idx" ON "attendance"("student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_student_id_date_key" ON "attendance"("student_id", "date");

-- CreateIndex
CREATE INDEX "marks_institute_id_student_id_date_idx" ON "marks"("institute_id", "student_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "marks_student_id_subject_test_name_key" ON "marks"("student_id", "subject", "test_name");

-- CreateIndex
CREATE INDEX "announcement_institute_id_class_status_idx" ON "announcement"("institute_id", "class", "status");

-- CreateIndex
CREATE INDEX "announcement_created_by_teacher_id_idx" ON "announcement"("created_by_teacher_id");

-- CreateIndex
CREATE INDEX "fee_institute_id_paid_due_date_idx" ON "fee"("institute_id", "paid", "due_date");

-- CreateIndex
CREATE INDEX "fee_student_id_idx" ON "fee"("student_id");

-- CreateIndex
CREATE INDEX "escalation_institute_id_status_idx" ON "escalation"("institute_id", "status");

-- CreateIndex
CREATE INDEX "escalation_student_id_idx" ON "escalation"("student_id");

-- CreateIndex
CREATE INDEX "audit_log_institute_id_created_at_idx" ON "audit_log"("institute_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_type_actor_id_idx" ON "audit_log"("actor_type", "actor_id");

-- AddForeignKey
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_student_link" ADD CONSTRAINT "guardian_student_link_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_student_link" ADD CONSTRAINT "guardian_student_link_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_student_link" ADD CONSTRAINT "guardian_student_link_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_code" ADD CONSTRAINT "activation_code_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_code" ADD CONSTRAINT "activation_code_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_code" ADD CONSTRAINT "activation_code_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_created_by_teacher_id_fkey" FOREIGN KEY ("created_by_teacher_id") REFERENCES "teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee" ADD CONSTRAINT "fee_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee" ADD CONSTRAINT "fee_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation" ADD CONSTRAINT "escalation_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation" ADD CONSTRAINT "escalation_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation" ADD CONSTRAINT "escalation_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
