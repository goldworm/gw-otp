import { OTP } from 'otplib';

const otp = new OTP();

const secret = otp.generateSecret();
console.log(`secret=${secret}`);

const token = await otp.generate({ secret });
console.log(`token=${token}`);

const result = await otp.verify({ secret, token });
console.log(result.valid);

const uri = otp.generateURI({
  issuer: 'goldworm',
  label: 'hello@gmail.com',
  secret,
});
console.log(uri);