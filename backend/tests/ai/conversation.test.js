import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createConversationService,
  listConversationsService,
  getConversationDetailsService,
  postMessageService
} from '../../src/modules/ai/ai.service.js';
import { ApiError } from '../../src/utils/apiError.js';

describe('AI Conversation API & Service Unit Tests', () => {
  const user1 = 'user-1111-1111-1111';
  const user2 = 'user-2222-2222-2222';

  test('create and list conversations for user', async () => {
    const created = await createConversationService(user1, { language: 'en', title: 'Test Conv' });
    assert.ok(created.conversationId, 'should return conversationId');
    assert.equal(created.language, 'en');
    assert.equal(created.title, 'Test Conv');

    const list = await listConversationsService(user1);
    assert.ok(Array.isArray(list));
    const found = list.find((c) => c.id === created.conversationId);
    assert.ok(found, 'created conversation should be in list');
  });

  test('ownership 404: user2 cannot access user1 conversation', async () => {
    const conv = await createConversationService(user1, { language: 'en', title: 'User1 Private' });

    // getConversationDetailsService by user2 should throw 404
    await assert.rejects(
      async () => {
        await getConversationDetailsService(user2, conv.conversationId);
      },
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // postMessageService by user2 should throw 404
    await assert.rejects(
      async () => {
        await postMessageService(user2, conv.conversationId, { question: 'Hello' });
      },
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });

  test('confidence is typeof number and sources are formatted in postMessageService', async () => {
    const conv = await createConversationService(user1, { language: 'en', title: 'Income Test' });
    const msgRes = await postMessageService(user1, conv.conversationId, {
      question: 'What documents are required for an income certificate in UP?'
    });

    assert.ok(msgRes.messageId, 'should return messageId');
    assert.equal(typeof msgRes.confidence, 'number', 'confidence must be a number');
    assert.equal(typeof msgRes.needsHuman, 'boolean', 'needsHuman must be a boolean');
    assert.ok(Array.isArray(msgRes.sources), 'sources must be an array');
    assert.ok(msgRes.suggestedService, 'suggestedService should be populated');
    assert.equal(msgRes.suggestedService.name, 'Income Certificate');
  });

  test('follow-up question inherits service from previous question', async () => {
    const conv = await createConversationService(user1, { language: 'en', title: 'Follow-up Test' });

    // Message 1: In-scope service question
    await postMessageService(user1, conv.conversationId, {
      question: 'What documents are required for an income certificate in UP?'
    });

    // Message 2: Follow-up question with no regex match
    const followUpRes = await postMessageService(user1, conv.conversationId, {
      question: 'and the fee?'
    });

    assert.equal(typeof followUpRes.confidence, 'number');
    assert.ok(followUpRes.suggestedService, 'follow-up should inherit income certificate service');
    assert.equal(followUpRes.suggestedService.name, 'Income Certificate');
  });

  test('guard still escalates (needsHuman=true) for an out-of-scope message', async () => {
    const conv = await createConversationService(user1, { language: 'en', title: 'OOS Test' });

    const oosRes = await postMessageService(user1, conv.conversationId, {
      question: 'How do I register for a new Voter ID card in UP?'
    });

    assert.equal(oosRes.needsHuman, true, 'out of scope message should trigger guard escalation');
    assert.equal(oosRes.suggestedService, null, 'out of scope message should have null suggestedService');
  });
});
