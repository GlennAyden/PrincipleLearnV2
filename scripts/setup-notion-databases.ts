// scripts/setup-notion-databases.ts
// Run with: npx ts-node --esm scripts/setup-notion-databases.ts

import { config } from 'dotenv';
config({ path: '.env.local' });

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const ROOT_PAGE_ID = process.env.NOTION_DATABASE_PAGE_ID || '2fd32a17-dd09-80e5-be49-e15432114496';

if (!NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY');
    process.exit(1);
}

interface DatabaseConfig {
    title: string;
    properties: Record<string, any>;
    envKey: string;
}

const DATABASES_TO_CREATE: DatabaseConfig[] = [
    {
        title: 'subtopic_cache',
        envKey: 'NOTION_SUBTOPIC_CACHE_DB_ID',
        properties: {
            cache_key: { title: {} },
            content: { rich_text: {} },
            created_at: { date: {} },
            updated_at: { date: {} },
        },
    },
    {
        title: 'discussion_sessions',
        envKey: 'NOTION_DISCUSSION_SESSIONS_DB_ID',
        properties: {
            Name: { title: {} },
            user_id: { rich_text: {} },
            course_id: { rich_text: {} },
            subtopic_id: { rich_text: {} },
            template_id: { rich_text: {} },
            status: { select: { options: [{ name: 'active' }, { name: 'in_progress' }, { name: 'completed' }] } },
            phase: { rich_text: {} },
            learning_goals: { rich_text: {} },
            created_at: { date: {} },
        },
    },
    {
        title: 'discussion_messages',
        envKey: 'NOTION_DISCUSSION_MESSAGES_DB_ID',
        properties: {
            Name: { title: {} },
            session_id: { rich_text: {} },
            role: { select: { options: [{ name: 'student' }, { name: 'agent' }] } },
            content: { rich_text: {} },
            step_key: { rich_text: {} },
            metadata: { rich_text: {} },
            created_at: { date: {} },
        },
    },
    {
        title: 'discussion_templates',
        envKey: 'NOTION_DISCUSSION_TEMPLATES_DB_ID',
        properties: {
            Name: { title: {} },
            subtopic_id: { rich_text: {} },
            template: { rich_text: {} },
            version: { rich_text: {} },
            source: { rich_text: {} },
            created_at: { date: {} },
        },
    },
    {
        title: 'api_logs',
        envKey: 'NOTION_API_LOGS_DB_ID',
        properties: {
            Name: { title: {} },
            endpoint: { rich_text: {} },
            method: { select: { options: [{ name: 'GET' }, { name: 'POST' }, { name: 'PUT' }, { name: 'DELETE' }] } },
            status: { number: {} },
            duration: { number: {} },
            user_id: { rich_text: {} },
            created_at: { date: {} },
        },
    },
    {
        title: 'course_generation_activity',
        envKey: 'NOTION_COURSE_GENERATION_ACTIVITY_DB_ID',
        properties: {
            Name: { title: {} },
            user_id: { rich_text: {} },
            course_id: { rich_text: {} },
            request_payload: { rich_text: {} },
            outline: { rich_text: {} },
            created_at: { date: {} },
        },
    },
];

async function createDatabase(config: DatabaseConfig): Promise<string | null> {
    try {
        const response = await fetch('https://api.notion.com/v1/databases', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({
                parent: { type: 'page_id', page_id: ROOT_PAGE_ID },
                title: [{ type: 'text', text: { content: config.title } }],
                properties: config.properties,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error(`Failed to create ${config.title}:`, error);
            return null;
        }

        const data = await response.json();
        console.log(`✅ Created ${config.title}: ${data.id}`);
        console.log(`   Add to .env.local: ${config.envKey}="${data.id}"`);
        return data.id;
    } catch (error) {
        console.error(`Error creating ${config.title}:`, error);
        return null;
    }
}

async function main() {
    console.log('🚀 Setting up Notion databases...\n');
    console.log(`Using Root Page: ${ROOT_PAGE_ID}\n`);

    const results: Record<string, string> = {};

    for (const config of DATABASES_TO_CREATE) {
        const id = await createDatabase(config);
        if (id) {
            results[config.envKey] = id;
        }
        // Rate limit: wait 400ms between requests
        await new Promise(resolve => setTimeout(resolve, 400));
    }

    console.log('\n📋 Add these to your .env.local:\n');
    console.log('# New Notion Database IDs');
    for (const [key, value] of Object.entries(results)) {
        console.log(`${key}="${value}"`);
    }
}

main().catch(console.error);
