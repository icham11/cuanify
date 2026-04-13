-- Add Admin as a first-class business member role.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'Admin';
