# Logto Admin Creator

A script to help provision Logto by automatically creating an admin account and configuring initial settings. This is typically used when setting up a new Logto instance to streamline the initial administration setup process.

## Prerequisites

- [Bun](https://bun.sh) installed
- Logto server running on `localhost:3002`

## Getting APP_SECRET

### Using Docker Compose

```bash
docker compose exec -it postgres bash -c 'PGPASSWORD=$POSTGRES_PASSWORD psql -A -t -U postgres -d logto -c "select secret from applications where id = \'m-admin\';"'
```

### Direct PostgreSQL Access

```bash
psql -U postgres -d logto -c "select secret from applications where id = 'm-admin';"
```

## Usage

### Command Line Arguments

```bash
./logto-create-admin --baseUrl=http://localhost:3002 --appSecret=your_secret --username=admin --password=password123
```

All arguments except `baseUrl` are required. They must be specified either via command line arguments or environment variables.

### Environment Variables

You can also use environment variables:

```bash
export BASE_URL=http://localhost:3002
export APP_SECRET=your_secret
export LOGTO_ADMIN_USERNAME=admin
export LOGTO_ADMIN_PASSWORD=password123
./logto-create-admin
```

### Default Values

- `baseUrl`: "http://localhost:3002"

### Required Parameters

The following parameters must be specified either via command line arguments or environment variables:

- `appSecret`
- `username`
- `password`

### Priority

1. Command line arguments
2. Environment variables
3. Default values

## Process

This script automatically performs the following operations:

1. Get access token
2. Create admin user
3. Add user to default organization (t-default)
4. Assign admin role in organization
5. Assign user roles
6. Change sign-in mode to SignIn

## Error Handling

- Displays error message and exits if required parameters are missing
- Displays error message and exits if any API request fails
