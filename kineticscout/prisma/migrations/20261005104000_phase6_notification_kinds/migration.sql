-- Team updates and in-app messages (Phase 6). Separate migration so later ones can use the values.
ALTER TYPE "NotificationKind" ADD VALUE 'TEAM_UPDATE';
ALTER TYPE "NotificationKind" ADD VALUE 'MESSAGE';
