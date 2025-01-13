import { parseArgs } from "node:util";

interface Config {
	baseUrl: string;
	appSecret: string;
	username: string;
	password: string;
}

import { basename } from "node:path";

function getProgram(): string {
	const [_bun, script] = Bun.argv;
	return script.includes("node_modules/bun/bin/bun")
		? "bun run start"
		: basename(script);
}

function showHelp(): never {
	const program = getProgram();
	console.error(`
Usage:
  ${program} --appSecret=<secret> --username=<username> --password=<password> [--baseUrl=<url>]

Required Parameters:
  --appSecret   Application secret
  --username    Admin username to create
  --password    Admin password to create

Optional Parameters:
  --baseUrl     Logto server URL (default: http://localhost:3002)

Environment Variables:
  APP_SECRET            Same as --appSecret
  LOGTO_ADMIN_USERNAME Same as --username
  LOGTO_ADMIN_PASSWORD Same as --password
  BASE_URL             Same as --baseUrl

Notes:
  To get APP_SECRET, you can use one of these SQL queries:

  1. Using Docker Compose:
     docker compose exec -it postgres bash -c 'PGPASSWORD=$POSTGRES_PASSWORD psql -A -t -U postgres -d logto -c "select secret from applications where id = \\'m-admin\\';"'

  2. Direct PostgreSQL access:
     psql -U postgres -d logto -c "select secret from applications where id = 'm-admin';"
`);
	process.exit(1);
}

function parseConfig(): Config {
	const { values: rawValues } = parseArgs({
		args: Bun.argv,
		options: {
			baseUrl: { type: "string" },
			appSecret: { type: "string" },
			username: { type: "string" },
			password: { type: "string" },
		},
		strict: false,
		allowPositionals: true,
	});

	// Convert potential boolean values to string or undefined
	const values = {
		baseUrl:
			typeof rawValues.baseUrl === "string" ? rawValues.baseUrl : undefined,
		appSecret:
			typeof rawValues.appSecret === "string" ? rawValues.appSecret : undefined,
		username:
			typeof rawValues.username === "string" ? rawValues.username : undefined,
		password:
			typeof rawValues.password === "string" ? rawValues.password : undefined,
	};

	const config: Config = {
		baseUrl: values.baseUrl ?? process.env.BASE_URL ?? "http://localhost:3002",
		appSecret:
			values.appSecret ??
			process.env.APP_SECRET ??
			(() => {
				console.error("Error: APP_SECRET is required\n");
				showHelp();
			})(),
		username:
			values.username ??
			process.env.LOGTO_ADMIN_USERNAME ??
			(() => {
				console.error("Error: Username is required\n");
				showHelp();
			})(),
		password:
			values.password ??
			process.env.LOGTO_ADMIN_PASSWORD ??
			(() => {
				console.error("Error: Password is required\n");
				showHelp();
			})(),
	};

	return config;
}

const config = parseConfig();

interface TokenResponse {
	access_token: string;
	expires_in: number;
	scope: string;
	token_type: string;
}

interface UserResponse {
	id: string;
	username: string;
	createdAt: number;
}

interface Role {
	id: string;
	name: string;
}

async function getAccessToken(
	baseUrl: string,
	appSecret: string,
): Promise<string> {
	const response = await fetch(`${baseUrl}/oidc/token`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "client_credentials",
			client_id: "m-admin",
			client_secret: appSecret,
			resource: "https://admin.logto.app/api",
			scope: "all",
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to get access token: ${response.statusText}`);
	}

	const data = (await response.json()) as TokenResponse;
	return data.access_token;
}

async function createUser(
	baseUrl: string,
	accessToken: string,
	username: string,
	password: string,
): Promise<string> {
	const response = await fetch(`${baseUrl}/api/users`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			username,
			password,
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to create user: ${response.statusText}`);
	}

	const data = (await response.json()) as UserResponse;
	return data.id;
}

async function addUserToOrganization(
	baseUrl: string,
	accessToken: string,
	userId: string,
): Promise<void> {
	const response = await fetch(`${baseUrl}/api/organizations/t-default/users`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			userIds: [userId],
		}),
	});

	if (!response.ok) {
		throw new Error(
			`Failed to add user to organization: ${response.statusText}`,
		);
	}
}

async function assignOrganizationRole(
	baseUrl: string,
	accessToken: string,
	userId: string,
): Promise<void> {
	const response = await fetch(
		`${baseUrl}/api/organizations/t-default/users/roles`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				userIds: [userId],
				organizationRoleIds: ["admin"],
			}),
		},
	);

	if (!response.ok) {
		throw new Error(
			`Failed to assign organization role: ${response.statusText}`,
		);
	}
}

async function getRoles(baseUrl: string, accessToken: string): Promise<Role[]> {
	const response = await fetch(`${baseUrl}/api/roles?type=User`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to get roles: ${response.statusText}`);
	}

	const data = (await response.json()) as Role[];
	return data;
}

async function assignUserRoles(
	baseUrl: string,
	accessToken: string,
	userId: string,
	roleIds: string[],
): Promise<void> {
	const response = await fetch(`${baseUrl}/api/users/${userId}/roles`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			roleIds,
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to assign user roles: ${response.statusText}`);
	}
}

async function updateSignInMode(
	baseUrl: string,
	accessToken: string,
): Promise<void> {
	const response = await fetch(`${baseUrl}/api/sign-in-exp`, {
		method: "PATCH",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			tenantId: "admin",
			signInMode: "SignIn",
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to update sign-in mode: ${response.statusText}`);
	}
}

async function main() {
	try {
		console.log("Getting access token...");
		const accessToken = await getAccessToken(config.baseUrl, config.appSecret);

		console.log("Creating user...");
		const userId = await createUser(
			config.baseUrl,
			accessToken,
			config.username,
			config.password,
		);
		console.log(`User created with ID: ${userId}`);

		console.log("Adding user to organization...");
		await addUserToOrganization(config.baseUrl, accessToken, userId);

		console.log("Assigning organization role...");
		await assignOrganizationRole(config.baseUrl, accessToken, userId);

		console.log("Getting roles...");
		const roles = await getRoles(config.baseUrl, accessToken);
		const roleIds = roles.map((role) => role.id);

		console.log("Assigning user roles...");
		await assignUserRoles(config.baseUrl, accessToken, userId, roleIds);

		console.log("Updating sign-in mode to SignIn...");
		await updateSignInMode(config.baseUrl, accessToken);

		console.log("Admin user creation completed successfully!");
		console.log(`Username: ${config.username}`);
	} catch (error) {
		console.error("Error:", error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

main();
