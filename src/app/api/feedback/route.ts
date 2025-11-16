import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function POST(req: NextRequest) {
  try {
    const { subtopicId, moduleIndex, subtopicIndex, feedback, userId, courseId } = await req.json();
    
    // Validasi data
    if (!feedback) {
      return NextResponse.json(
        { error: "Feedback is required" },
        { status: 400 }
      );
    }
    
    // Save feedback to database
    if (userId && courseId) {
      try {
        // Find user in database
        const users = await DatabaseService.getRecords('users', {
          filter: { email: userId },
          limit: 1
        });
        
        if (users.length === 0) {
          console.warn(`User with email ${userId} not found in database`);
        } else {
          const user = users[0];
          
          // Find course in database
          const courses = await DatabaseService.getRecords('courses', {
            filter: { id: courseId },
            limit: 1
          });
          
          if (courses.length === 0) {
            console.warn(`Course with ID ${courseId} not found in database`);
          } else {
            let subtopicTitle: string | null = null;
            if (subtopicId) {
              try {
                const subtopics = await DatabaseService.getRecords('subtopics', {
                  filter: { id: subtopicId },
                  limit: 1,
                });
                subtopicTitle = subtopics[0]?.title ?? null;
              } catch (subtopicError) {
                console.error('Error fetching subtopic for feedback context:', subtopicError);
              }
            }
            const parseIndex = (value: any) => {
              if (typeof value === 'number' && Number.isFinite(value)) return value
              const numeric = Number(value)
              return Number.isFinite(numeric) ? numeric : null
            }
            const normalizedModuleIndex = parseIndex(moduleIndex)
            const normalizedSubtopicIndex = parseIndex(subtopicIndex)

            // Save as feedback in database
            const feedbackData = {
              user_id: user.id,
              course_id: courseId,
              subtopic_id: subtopicId || null,
              module_index: normalizedModuleIndex,
              subtopic_index: normalizedSubtopicIndex,
              subtopic_label: subtopicTitle,
              rating: 5, // Default rating since no rating provided
              comment: feedback
            };
            
            const savedFeedback = await DatabaseService.insertRecord('feedback', feedbackData);
            console.log('Feedback saved to database:', {
              id: savedFeedback.id,
              user: userId,
              course: courseId
            });
          }
        }
      } catch (error) {
        console.error('Error saving feedback to database:', error);
        // Continue execution even if database save fails
      }
    }
    
    // Kirim kembali respons ke client
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving feedback:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save feedback" },
      { status: 500 }
    );
  }
} 
