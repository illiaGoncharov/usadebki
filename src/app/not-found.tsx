import { Frame } from "@/components/Frame";

export default function NotFound() {
  return (
    <Frame
      crumb={<a href="/">Лента</a>}
      left={<p>Такой страницы нет.</p>}
      center={
        <p>
          <a className="text-link" href="/">
            Вернуться к ленте
          </a>
        </p>
      }
      right={<p className="muted">Если усадьба должна быть в реестре, её ещё нет в этой базе.</p>}
    />
  );
}
