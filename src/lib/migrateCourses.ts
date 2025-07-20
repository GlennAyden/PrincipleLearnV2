import { getUserSpecificKey } from '../hooks/useLocalStorage';

/**
 * Migrates courses from the old global storage to user-specific storage
 * This should be called once when a user logs in
 */
export function migrateCourses(userEmail: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Check if migration has already been performed
    const migrationKey = `pl_migration_${userEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const hasMigrated = localStorage.getItem(migrationKey);
    
    if (hasMigrated) {
      console.log('Course migration already performed for this user');
      return;
    }
    
    // Get global courses if they exist
    const globalCoursesJson = localStorage.getItem('pl_courses');
    if (!globalCoursesJson) {
      // No courses to migrate
      localStorage.setItem(migrationKey, 'true');
      return;
    }
    
    // Parse global courses
    const globalCourses = JSON.parse(globalCoursesJson);
    if (!Array.isArray(globalCourses) || globalCourses.length === 0) {
      localStorage.setItem(migrationKey, 'true');
      return;
    }
    
    // Get user-specific key
    const userKey = getUserSpecificKey('pl_courses');
    
    // Check if user already has courses
    const userCoursesJson = localStorage.getItem(userKey);
    let userCourses = [];
    
    if (userCoursesJson) {
      try {
        userCourses = JSON.parse(userCoursesJson);
        if (!Array.isArray(userCourses)) {
          userCourses = [];
        }
      } catch (e) {
        console.error('Error parsing user courses:', e);
        userCourses = [];
      }
    }
    
    // Merge courses, avoiding duplicates by ID
    const existingIds = new Set(userCourses.map((c: any) => c.id));
    const newCourses = globalCourses.filter((c: any) => !existingIds.has(c.id));
    
    // Save merged courses
    const mergedCourses = [...userCourses, ...newCourses];
    localStorage.setItem(userKey, JSON.stringify(mergedCourses));
    
    // Mark migration as complete
    localStorage.setItem(migrationKey, 'true');
    
    console.log(`Migrated ${newCourses.length} courses for user ${userEmail}`);
  } catch (error) {
    console.error('Error during course migration:', error);
  }
} 