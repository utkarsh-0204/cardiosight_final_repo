export interface Environment {
  production: boolean;
  apiUrl: string;
  mlApiUrl: string;
  useMock: boolean;
  mockDelay: number;
}

export const environment: Environment = {
  production: true,
  apiUrl: 'https://cardiosight-api.onrender.com/api',
  mlApiUrl: 'https://cardiosight-ml.onrender.com',
  useMock: false,
  mockDelay: 0,
};
