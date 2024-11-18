# #!/bin/sh

# set -e

# echo "Checking database state..."

# # Test the connection to the database
# npx prisma db pull > /dev/null 2>&1 || {
#   echo "Database connection failed. Ensure the database is running and accessible."
#   exit 1
# }

# # Check if the schema matches
# SCHEMA_DIFF=$(npx prisma db diff)

# if [ -z "$SCHEMA_DIFF" ]; then
#   echo "Database schema is already up-to-date."
# else
#   echo "Database schema is out of sync. Pushing changes..."
#   npx prisma db push
# fi

#!/bin/bash

npx prisma generate
npx prisma db push
node dist/seed.js
node dist/main