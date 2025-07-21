2025-07-21T00:55:58.952Z [info] Debug: Checking if user exists with email: sal@gmail.com
2025-07-21T00:55:59.896Z [info] Debug: Existing users query result: []
2025-07-21T00:55:59.896Z [info] Debug: No existing user found, proceeding with registration
2025-07-21T00:56:00.111Z [info] Debug: Attempting to create user with data: {
  email: 'sal@gmail.com',
  password_hash: '$2b$10$zjGvmkQV1b0hgR.IZtZjTueV/Hm1Yn27wqyIu2vUr9poH.BGC.8FS',
  role: 'user'
}
2025-07-21T00:56:00.898Z [error] Debug: Error creating user: Error [DatabaseError]: Failed to insert record into users
    at a.insertRecord (.next/server/app/api/auth/register/route.js:1:1206)
    at async p (.next/server/app/api/auth/register/route.js:1:4560) {
  originalError: [Object]
}
2025-07-21T00:56:00.898Z [error] Debug: Create error details: Failed to insert record into users
2025-07-21T00:56:00.899Z [error] Registration error: Error [DatabaseError]: Failed to insert record into users
    at a.insertRecord (.next/server/app/api/auth/register/route.js:1:1206)
    at async p (.next/server/app/api/auth/register/route.js:1:4560) {
  originalError: [Object]
}