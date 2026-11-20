const API_BASE = import.meta?.env?.VITE_API_BASE_URL || 'https://localhost:5000/api';
const REVIEW_URL = `${API_BASE}/reviews`;

// Optional reference matching the seeded test teacher profile
export const TEST_TEACHER_EMAIL = 'test.teacher@example.com';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${REVIEW_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      (typeof data === 'object' && data !== null && (data.message || data.error)) ||
      `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const reviewApi = {
  /**
   * Fetch reviews for a specific teacher profile (supports optional pagination/filters).
   * Example: getByTeacher('65f1...', { page: 1, limit: 10 })
   */
  getByTeacher(teacherId, params = {}) {
    if (!teacherId) {
      return Promise.reject(new Error('teacherId is required to fetch reviews.'));
    }
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();

    return request(`/teacher/${encodeURIComponent(teacherId)}${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Fetch a single review by ID.
   */
  getById(reviewId) {
    if (!reviewId) {
      return Promise.reject(new Error('reviewId is required.'));
    }
    return request(`/${encodeURIComponent(reviewId)}`, {
      method: 'GET',
    });
  },

  /**
   * Create a new review for a teacher.
   * @param {Object} payload - e.g. { teacherId, rating, comment, sessionId }
   */
  create(payload) {
    return request('', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Update an existing review (full or partial).
   */
  update(reviewId, payload) {
    if (!reviewId) {
      return Promise.reject(new Error('reviewId is required to update a review.'));
    }
    return request(`/${encodeURIComponent(reviewId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Delete a review by ID.
   */
  remove(reviewId) {
    if (!reviewId) {
      return Promise.reject(new Error('reviewId is required to delete a review.'));
    }
    return request(`/${encodeURIComponent(reviewId)}`, {
      method: 'DELETE',
    });
  },
};

export default reviewApi;