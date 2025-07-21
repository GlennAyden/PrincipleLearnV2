import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const courseId = params.id;
    
    console.log(`[Debug Course Test] Testing course ID: ${courseId}`);
    
    // Step 1: Check if course exists
    console.log(`[Debug Course Test] Step 1: Checking course existence`);
    const courses = await DatabaseService.getRecords('courses', {
      filter: { id: courseId },
      limit: 1
    });
    
    if (courses.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Course not found in database',
        debug: {
          courseId,
          coursesFound: 0,
          step: 'course_lookup_failed'
        }
      }, { status: 404 });
    }
    
    const course = courses[0];
    console.log(`[Debug Course Test] Course found:`, course);
    
    // Step 2: Check subtopics
    console.log(`[Debug Course Test] Step 2: Checking subtopics`);
    const subtopics = await DatabaseService.getRecords('subtopics', {
      filter: { course_id: courseId },
      orderBy: { column: 'order_index', ascending: true }
    });
    
    console.log(`[Debug Course Test] Found ${subtopics.length} subtopics`);
    
    // Step 3: Test content parsing
    console.log(`[Debug Course Test] Step 3: Testing content parsing`);
    const parsedSubtopics = [];
    const parseErrors = [];
    
    for (let i = 0; i < subtopics.length; i++) {
      const subtopic = subtopics[i];
      try {
        const content = JSON.parse(subtopic.content);
        parsedSubtopics.push({
          id: subtopic.id,
          title: subtopic.title,
          order_index: subtopic.order_index,
          contentParsed: true,
          contentPreview: content
        });
      } catch (error) {
        parseErrors.push({
          subtopicId: subtopic.id,
          error: error instanceof Error ? error.message : 'Unknown parse error',
          rawContent: subtopic.content
        });
      }
    }
    
    // Step 4: Transform to outline format (same as in course page)
    console.log(`[Debug Course Test] Step 4: Transforming to outline format`);
    const outline = subtopics.map((subtopic, index) => {
      let content;
      try {
        content = JSON.parse(subtopic.content);
      } catch {
        content = { module: subtopic.title, subtopics: [] };
      }
      
      return {
        module: content.module || subtopic.title || `Module ${index + 1}`,
        subtopics: content.subtopics || []
      };
    });
    
    return NextResponse.json({
      success: true,
      debug: {
        courseId,
        course: {
          id: course.id,
          title: course.title,
          difficulty_level: course.difficulty_level,
          created_at: course.created_at
        },
        subtopicsCount: subtopics.length,
        parsedSubtopicsCount: parsedSubtopics.length,
        parseErrors: parseErrors.length,
        outlineCount: outline.length
      },
      data: {
        course,
        subtopics: parsedSubtopics,
        outline,
        parseErrors
      }
    });
    
  } catch (error) {
    console.error('[Debug Course Test] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        courseId: params.id,
        step: 'unexpected_error'
      },
      details: error
    }, { status: 500 });
  }
}