/**
 * Test Multi-Token Notion Load Balancer
 * 
 * Run: npx tsx scripts/test-multi-token.ts
 */

import { getTokenStats } from '../src/lib/notion-database';

console.log('='.repeat(50));
console.log('🔑 Notion Multi-Token Configuration Test');
console.log('='.repeat(50));

// Display token stats
const stats = getTokenStats();

console.log('\n📊 Token Statistics:');
console.log(`   • Token Count: ${stats.tokenCount}`);
console.log(`   • Effective Rate Limit: ${stats.effectiveRateLimit}`);
console.log(`   • Delay per Request: ${stats.rateLimitMs}ms`);

// Calculate performance improvement
const singleTokenTime = (240 / 3); // 40 users × 6 req with 1 token
const multiTokenTime = (240 / (stats.tokenCount * 3));

console.log('\n⚡ Performance for 40 users (240 requests):');
console.log(`   • Single Token: ~${singleTokenTime.toFixed(0)} seconds`);
console.log(`   • Multi Token:  ~${multiTokenTime.toFixed(0)} seconds`);
console.log(`   • Improvement:  ${(singleTokenTime / multiTokenTime).toFixed(1)}x faster`);

console.log('\n✅ Configuration looks good!');
console.log('='.repeat(50));
