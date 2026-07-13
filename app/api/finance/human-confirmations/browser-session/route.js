import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

export async function GET(){const nonce=randomBytes(24).toString('base64url');const response=NextResponse.json({browser_nonce:nonce});response.cookies.set('last_say_confirmation_session',nonce,{httpOnly:true,sameSite:'strict',secure:false,path:'/api/finance/human-confirmations',maxAge:600});return response;}
