-- AlterTable
ALTER TABLE "announcement" ADD COLUMN     "delivered_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "fee_reminder" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "fee_id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_reminder_institute_id_idx" ON "fee_reminder"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_reminder_student_id_fee_id_due_date_key" ON "fee_reminder"("student_id", "fee_id", "due_date");

-- AddForeignKey
ALTER TABLE "fee_reminder" ADD CONSTRAINT "fee_reminder_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_reminder" ADD CONSTRAINT "fee_reminder_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_reminder" ADD CONSTRAINT "fee_reminder_fee_id_fkey" FOREIGN KEY ("fee_id") REFERENCES "fee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_reminder" ADD CONSTRAINT "fee_reminder_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;
