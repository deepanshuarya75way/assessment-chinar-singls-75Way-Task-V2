const mongoose = require('mongoose');
const TeacherProfile = require('../models/TeacherProfile'); // Update path to match your project

const testTeacherProfile = {
  name: 'Test Teacher',
  mobile: '+91-9000000000',
  email: 'test.teacher@example.com',
  whatsapp: '+91-9000000000',
  gender: 'Female',
  dob: new Date('1995-01-15'),
  photo: 'https://example.com/photos/test-teacher.jpg',
  qualification: 'M.Sc., B.Ed.',
  institution: 'Sample State University',
  experience: '5 years',
  bio: 'Sample teacher profile created for testing.',
  subjects: ['Mathematics', 'Science'],
  classes: ['Class 8', 'Class 9', 'Class 10'],
  boards: ['CBSE'],
  teachingMode: 'Both',
  cities: ['Bengaluru'],
  localities: ['Indiranagar'],
  applicationStatus: 'approved',
  approvedAt: new Date(),
  rating: 4.5,
  totalReviews: 10,
  totalSessions: 50,
  totalEarnings: 40000,
  monthlyEarnings: 8000,
  expectedFee: '₹700 / hr',
  isAvailable: true,
  isActive: true,
  idProof: 'https://example.com/docs/test-id.pdf',
  certificate: 'https://example.com/docs/test-cert.pdf',
  consent: true,
};

async function seedTestTeacher(profile = testTeacherProfile, { disconnect = false } = {}) {
  try {
    if (mongoose.connection.readyState === 0) {
     
      await mongoose.connect("mongodb://127.0.0.1:27017");
    }

    await TeacherProfile.init();

    const normalizedEmail = profile.email.toLowerCase().trim();
    const result = await TeacherProfile.updateOne(
      { email: normalizedEmail },
      { $set: { ...profile, email: normalizedEmail } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    console.log('Test teacher seed complete:', {
      email: normalizedEmail,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    });

    return result;
  } finally {
    if (disconnect && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  seedTestTeacher(testTeacherProfile, { disconnect: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error seeding test teacher:', err);
      process.exit(1);
    });
}

module.exports = { seedTestTeacher, testTeacherProfile };