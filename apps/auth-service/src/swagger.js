import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'Auth Service API',
    description:
      'Automatically generated swagger documentation for the Auth Service API',
    version: '1.0.0',
  },
  host: 'localhost:6001',
  basepath: '/api',
  schemes: ['http'],
};

const outputFile = './swagger-output.json';
const endpointsFiles = ['./routes/auth.router.ts'];

swaggerAutogen()(outputFile, endpointsFiles, doc);
