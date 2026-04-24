import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL não definida.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.isActive) {
          return null;
        }

        const passwordOk = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!passwordOk) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          condominiumId: user.condominiumId ?? undefined,
          administratorId: user.administratorId ?? undefined,
          residentId: user.residentId ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role;
        token.condominiumId = (user as { condominiumId?: string }).condominiumId;
        token.administratorId = (user as { administratorId?: string }).administratorId;
        token.residentId = (user as { residentId?: string }).residentId;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.condominiumId = token.condominiumId as string | undefined;
        session.user.administratorId = token.administratorId as string | undefined;
        session.user.residentId = token.residentId as string | undefined;
      }

      return session;
    },
  },
};