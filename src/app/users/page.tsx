import { PageHead } from "@/components/editorial";
import { UserSearch } from "@/components/discover/UserSearch";

export default function UsersPage() {
  return (
    <div className="mx-auto max-w-[1560px] px-6 py-12 sm:px-10">
      <PageHead kicker="PEOPLE · FIND USERS">Find people</PageHead>
      <div className="mt-8">
        <UserSearch />
      </div>
    </div>
  );
}
