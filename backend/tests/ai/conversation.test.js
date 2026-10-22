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

  test('create conversation with hinglish language', async () => {
    const conv = await createConversationService(user1, { language: 'hinglish', title: 'Hinglish Test' });
    assert.equal(conv.language, 'hinglish', 'conversation should have language hinglish');

    const details = await getConversationDetailsService(user1, conv.conversationId);
    assert.equal(details.language, 'hinglish', 'conversation details should preserve hinglish language');
  });

  test('post message with hinglish language returns hinglish and updates conversation', async () => {
    const conv = await createConversationService(user1, { language: 'en', title: 'Language Switch Test' });
    assert.equal(conv.language, 'en');

    // Switch language to hinglish on message post
    const res1 = await postMessageService(user1, conv.conversationId, {
      question: 'caste certificate ke liye kya documents chahiye?',
      language: 'hinglish'
    });

    assert.equal(res1.language, 'hinglish', 'message response should report hinglish language');

    // Verify conversation details now reflect hinglish
    const updatedDetails = await getConversationDetailsService(user1, conv.conversationId);
    assert.equal(updatedDetails.language, 'hinglish', 'conversation language should update to hinglish');

    // Subsequent message without explicit language should inherit hinglish from conversation
    const res2 = await postMessageService(user1, conv.conversationId, {
      question: 'aur fee kitni hai?'
    });
    assert.equal(res2.language, 'hinglish', 'subsequent message should inherit hinglish');
  });

  test('switching between en, hi, and hinglish preserves language consistency across messages', async () => {
    const conv = await createConversationService(user1, { language: 'en', title: 'Multi Language Test' });

    // Step 1: English
    const resEn = await postMessageService(user1, conv.conversationId, {
      question: 'What documents are needed for birth certificate?',
      language: 'en'
    });
    assert.equal(resEn.language, 'en');

    // Step 2: Switch to Hindi
    const resHi = await postMessageService(user1, conv.conversationId, {
      question: 'निवास प्रमाण पत्र के लिए कौन से दस्तावेज चाहिए?',
      language: 'hi'
    });
    assert.equal(resHi.language, 'hi');
    const detailsHi = await getConversationDetailsService(user1, conv.conversationId);
    assert.equal(detailsHi.language, 'hi');

    // Step 3: Switch to Hinglish
    const resHinglish = await postMessageService(user1, conv.conversationId, {
      question: 'income certificate ke liye documents batao',
      language: 'hinglish'
    });
    assert.equal(resHinglish.language, 'hinglish');
    const detailsHinglish = await getConversationDetailsService(user1, conv.conversationId);
    assert.equal(detailsHinglish.language, 'hinglish');
  });
});
