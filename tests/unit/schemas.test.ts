import {
  LoginSchema,
  RegisterSchema,
  AdminRegisterSchema,
  GenerateCourseSchema,
  QuizSubmitSchema,
  AskQuestionSchema,
  ChallengeThinkingSchema,
  ChallengeFeedbackSchema,
  GenerateExamplesSchema,
  FeedbackSchema,
  JurnalSchema,
  parseBody,
} from '@/lib/schemas';

// ---------------------------------------------------------------------------
// 1. LoginSchema
// ---------------------------------------------------------------------------
describe('LoginSchema', () => {
  it('should accept valid login data', () => {
    const result = LoginSchema.safeParse({
      email: 'Test@Example.com',
      password: 'pass123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('should reject missing email', () => {
    const result = LoginSchema.safeParse({ password: 'pass123' });
    expect(result.success).toBe(false);
  });

  it('should reject missing password', () => {
    const result = LoginSchema.safeParse({ email: 'user@test.com' });
    expect(result.success).toBe(false);
  });

  it('should reject an invalid email format', () => {
    const result = LoginSchema.safeParse({
      email: 'not-an-email',
      password: 'pass123',
    });
    expect(result.success).toBe(false);
  });

  it('should trim and lowercase the email', () => {
    const result = LoginSchema.safeParse({
      email: '  Hello@World.COM  ',
      password: 'x',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('hello@world.com');
    }
  });

  it('should default rememberMe to false when omitted', () => {
    const result = LoginSchema.safeParse({
      email: 'a@b.com',
      password: 'pw',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it('should accept rememberMe when explicitly set to true', () => {
    const result = LoginSchema.safeParse({
      email: 'a@b.com',
      password: 'pw',
      rememberMe: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. RegisterSchema
// ---------------------------------------------------------------------------
describe('RegisterSchema', () => {
  const validData = {
    email: 'user@test.com',
    password: 'Strong1Pwd',
  };

  it('should accept valid registration data', () => {
    const result = RegisterSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept valid data with an optional name', () => {
    const result = RegisterSchema.safeParse({ ...validData, name: 'Alice' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice');
    }
  });

  it('should reject a password shorter than 8 characters', () => {
    const result = RegisterSchema.safeParse({
      email: 'u@t.com',
      password: 'Sh0rt',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a password without an uppercase letter', () => {
    const result = RegisterSchema.safeParse({
      email: 'u@t.com',
      password: 'alllower1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a password without a lowercase letter', () => {
    const result = RegisterSchema.safeParse({
      email: 'u@t.com',
      password: 'ALLUPPER1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a password without a digit', () => {
    const result = RegisterSchema.safeParse({
      email: 'u@t.com',
      password: 'NoDigitsHere',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. AdminRegisterSchema (Finding 6.1.2 — same strength as RegisterSchema)
// ---------------------------------------------------------------------------
describe('AdminRegisterSchema', () => {
  it('should accept a strong password', () => {
    const result = AdminRegisterSchema.safeParse({
      email: 'admin@test.com',
      password: 'Admin1Pass',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a password shorter than 8 characters', () => {
    const result = AdminRegisterSchema.safeParse({
      email: 'admin@test.com',
      password: 'Ad1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a password without an uppercase letter', () => {
    const result = AdminRegisterSchema.safeParse({
      email: 'admin@test.com',
      password: 'alllower1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a password without a lowercase letter', () => {
    const result = AdminRegisterSchema.safeParse({
      email: 'admin@test.com',
      password: 'ALLUPPER1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a password without a digit', () => {
    const result = AdminRegisterSchema.safeParse({
      email: 'admin@test.com',
      password: 'NoDigitHere',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. GenerateCourseSchema
// ---------------------------------------------------------------------------
describe('GenerateCourseSchema', () => {
  const validData = {
    topic: 'Machine Learning',
    goal: 'Understand basics',
    level: 'Beginner',
  };

  it('should accept valid course generation data', () => {
    const result = GenerateCourseSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept data with optional fields', () => {
    const result = GenerateCourseSchema.safeParse({
      ...validData,
      extraTopics: 'Neural Networks',
      userId: 'u1',
      userEmail: 'u@t.com',
    });
    expect(result.success).toBe(true);
  });

  it('should accept each canonical level value (Beginner, Intermediate, Advanced)', () => {
    for (const level of ['Beginner', 'Intermediate', 'Advanced'] as const) {
      const result = GenerateCourseSchema.safeParse({ ...validData, level });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.level).toBe(level);
      }
    }
  });

  it('should reject missing topic', () => {
    const { topic: _, ...rest } = validData;
    const result = GenerateCourseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing goal', () => {
    const { goal: _, ...rest } = validData;
    const result = GenerateCourseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing level', () => {
    const { level: _, ...rest } = validData;
    const result = GenerateCourseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject empty topic string', () => {
    const result = GenerateCourseSchema.safeParse({ ...validData, topic: '' });
    expect(result.success).toBe(false);
  });

  it('should reject an empty level string', () => {
    const result = GenerateCourseSchema.safeParse({ ...validData, level: '' });
    expect(result.success).toBe(false);
  });

  it('should reject a lowercase level (enum is case-sensitive)', () => {
    const result = GenerateCourseSchema.safeParse({ ...validData, level: 'beginner' });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod enum error mentions the allowed values
      const message = result.error.issues[0]?.message ?? '';
      expect(message).toMatch(/Beginner|Intermediate|Advanced/);
    }
  });

  it('should reject an out-of-enum level value like "Expert"', () => {
    const result = GenerateCourseSchema.safeParse({ ...validData, level: 'Expert' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? '';
      expect(message).toMatch(/Beginner|Intermediate|Advanced/);
    }
  });

  it('should reject an arbitrary random level string', () => {
    const result = GenerateCourseSchema.safeParse({ ...validData, level: 'SuperAdvanced' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? '';
      expect(message).toMatch(/Beginner|Intermediate|Advanced/);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. QuizSubmitSchema
// ---------------------------------------------------------------------------
describe('QuizSubmitSchema', () => {
  const validAnswer = {
    question: 'What is 2+2?',
    options: ['3', '4', '5'],
    userAnswer: '4',
    isCorrect: true,
    questionIndex: 0,
  };

  const validData = {
    userId: 'user-1',
    courseId: 'course-1',
    subtopic: 'Arithmetic',
    score: 100,
    answers: [validAnswer],
  };

  it('should accept valid quiz submission data', () => {
    const result = QuizSubmitSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject an empty answers array', () => {
    const result = QuizSubmitSchema.safeParse({ ...validData, answers: [] });
    expect(result.success).toBe(false);
  });

  it('should reject missing userId', () => {
    const { userId: _, ...rest } = validData;
    const result = QuizSubmitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject empty userId', () => {
    const result = QuizSubmitSchema.safeParse({ ...validData, userId: '' });
    expect(result.success).toBe(false);
  });

  it('should reject missing courseId', () => {
    const { courseId: _, ...rest } = validData;
    const result = QuizSubmitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing subtopic', () => {
    const { subtopic: _, ...rest } = validData;
    const result = QuizSubmitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. AskQuestionSchema
// ---------------------------------------------------------------------------
describe('AskQuestionSchema', () => {
  const validData = {
    question: 'What is ML?',
    context: 'Machine learning chapter',
    userId: 'user-1',
    courseId: 'course-1',
  };

  it('should accept valid data', () => {
    const result = AskQuestionSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject missing question', () => {
    const { question: _, ...rest } = validData;
    const result = AskQuestionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing context', () => {
    const { context: _, ...rest } = validData;
    const result = AskQuestionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing userId', () => {
    const { userId: _, ...rest } = validData;
    const result = AskQuestionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing courseId', () => {
    const { courseId: _, ...rest } = validData;
    const result = AskQuestionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should accept promptComponents with the canonical 4 fields', () => {
    const result = AskQuestionSchema.safeParse({
      ...validData,
      promptComponents: {
        tujuan: 'Memahami X',
        konteks: 'Saya pemula',
        batasan: 'Maks 3 paragraf',
        reasoning: 'Karena ingin lulus ujian',
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept promptComponents with a partial subset of fields', () => {
    const result = AskQuestionSchema.safeParse({
      ...validData,
      promptComponents: { tujuan: 'Memahami X' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject promptComponents containing unknown fields (Bug #13 — strict)', () => {
    const result = AskQuestionSchema.safeParse({
      ...validData,
      promptComponents: { tujuan: 'X', evilField: 'should not pass' },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. ChallengeThinkingSchema
// ---------------------------------------------------------------------------
describe('ChallengeThinkingSchema', () => {
  it('should accept valid data', () => {
    const result = ChallengeThinkingSchema.safeParse({ context: 'Some text' });
    expect(result.success).toBe(true);
  });

  it('should default level to intermediate when omitted', () => {
    const result = ChallengeThinkingSchema.safeParse({ context: 'text' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBe('intermediate');
    }
  });

  it('should reject missing context', () => {
    const result = ChallengeThinkingSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty context', () => {
    const result = ChallengeThinkingSchema.safeParse({ context: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. ChallengeFeedbackSchema
// ---------------------------------------------------------------------------
describe('ChallengeFeedbackSchema', () => {
  it('should accept valid data', () => {
    const result = ChallengeFeedbackSchema.safeParse({
      question: 'Why?',
      answer: 'Because.',
    });
    expect(result.success).toBe(true);
  });

  it('should default level to intermediate', () => {
    const result = ChallengeFeedbackSchema.safeParse({
      question: 'Why?',
      answer: 'Because.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBe('intermediate');
    }
  });

  it('should reject missing question', () => {
    const result = ChallengeFeedbackSchema.safeParse({ answer: 'Because.' });
    expect(result.success).toBe(false);
  });

  it('should reject missing answer', () => {
    const result = ChallengeFeedbackSchema.safeParse({ question: 'Why?' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. GenerateExamplesSchema
// ---------------------------------------------------------------------------
describe('GenerateExamplesSchema', () => {
  it('should accept valid data', () => {
    const result = GenerateExamplesSchema.safeParse({ context: 'example context' });
    expect(result.success).toBe(true);
  });

  it('should reject missing context', () => {
    const result = GenerateExamplesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty context', () => {
    const result = GenerateExamplesSchema.safeParse({ context: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. FeedbackSchema
// ---------------------------------------------------------------------------
describe('FeedbackSchema', () => {
  const baseData = {
    userId: 'user-1',
    courseId: 'course-1',
  };

  it('should accept valid data with comment', () => {
    const result = FeedbackSchema.safeParse({
      ...baseData,
      comment: 'Great course!',
    });
    expect(result.success).toBe(true);
  });

  it('should reject the legacy `feedback` field (Bug #12 — comment is canonical)', () => {
    const result = FeedbackSchema.safeParse({
      ...baseData,
      feedback: 'Helpful material',
    });
    expect(result.success).toBe(false);
  });

  it('should reject when comment is missing', () => {
    const result = FeedbackSchema.safeParse(baseData);
    expect(result.success).toBe(false);
  });

  it('should reject when comment is an empty string', () => {
    const result = FeedbackSchema.safeParse({
      ...baseData,
      comment: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject when comment is whitespace only', () => {
    const result = FeedbackSchema.safeParse({
      ...baseData,
      comment: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('should accept an optional rating between 1 and 5', () => {
    const result = FeedbackSchema.safeParse({
      ...baseData,
      comment: 'Good',
      rating: 4,
    });
    expect(result.success).toBe(true);
  });

  it('should reject a rating outside the 1-5 range', () => {
    const result = FeedbackSchema.safeParse({
      ...baseData,
      comment: 'Good',
      rating: 6,
    });
    expect(result.success).toBe(false);
  });

  it('should accept the full set of 5 user-input fields', () => {
    const result = FeedbackSchema.safeParse({
      ...baseData,
      comment: 'Excellent material',
      rating: 5,
      subtopicId: 'subtopic-uuid',
      moduleIndex: 0,
      subtopicIndex: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should reject unknown fields (strict mode)', () => {
    const result = FeedbackSchema.safeParse({
      ...baseData,
      comment: 'Good',
      unexpectedField: 'should not pass',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. JurnalSchema
// ---------------------------------------------------------------------------
describe('JurnalSchema', () => {
  const baseData = {
    userId: 'user-1',
    courseId: 'course-1',
  };

  it('should accept valid data with string content', () => {
    const result = JurnalSchema.safeParse({
      ...baseData,
      content: 'Today I learned about ML.',
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid data with record/object content', () => {
    const result = JurnalSchema.safeParse({
      ...baseData,
      content: { understood: 'yes', confused: 'no' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty string content', () => {
    const result = JurnalSchema.safeParse({ ...baseData, content: '' });
    expect(result.success).toBe(false);
  });

  it('should reject missing userId', () => {
    const result = JurnalSchema.safeParse({ courseId: 'c1', content: 'text' });
    expect(result.success).toBe(false);
  });

  it('should reject missing courseId', () => {
    const result = JurnalSchema.safeParse({ userId: 'u1', content: 'text' });
    expect(result.success).toBe(false);
  });

  it('should reject missing content', () => {
    const result = JurnalSchema.safeParse(baseData);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. parseBody helper
// ---------------------------------------------------------------------------
describe('parseBody', () => {
  it('should return success with parsed data for valid input', () => {
    const result = parseBody(LoginSchema, {
      email: 'User@Test.com',
      password: 'pw',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@test.com');
      expect(result.data.password).toBe('pw');
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it('should return failure with a NextResponse for invalid input', () => {
    const result = parseBody(LoginSchema, { password: 'pw' });
    expect(result.success).toBe(false);
    if (!result.success) {
      // The response should be a NextResponse with status 400
      expect(result.response).toBeDefined();
      expect(result.response.status).toBe(400);
    }
  });

  it('should return the first Zod error message in the response body', async () => {
    const result = parseBody(LoginSchema, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      const body = await result.response.json();
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe('string');
    }
  });
});
