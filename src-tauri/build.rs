use base64::{engine::general_purpose, Engine as _};
use std::{env, fs, path::PathBuf};

const FALLBACK_ICON_ICO: &str = "AAABAAEAICAAAAEAIABRAwAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAgAAAAIAgGAAAAc3p69AAAAxhJREFUeNq9V0tPE1EU/uZhZ/qiLZSkGpCCKLjw8RdMXBhjIrrSnStdaGLc6caFG5fGRBNxo3GvYmJc+R8sMfGBVQqiVKAwdAY6HdqO90w6DdFOe/viJDeZuXPnft/97jn3niNjl0WTyWgpb960bWEKsE+iqyakBMGekfvUh1omo9V63YfwQOKKXREe2LCj6KEJEDRBtG/puexzepdc8EoFz9ijit6batuYUoOhBatgpARH9s3ifK9XXk8JOaKMSrKo3raBM9h7U22rVJSZw51nDuc5yuf3IxKLQ/WHIO6TuWau7JRQKBjIr63Asoqe4whbCMYSnuh9/XEMDo9hS9dRLGyjUilxERBFGYo/gHA4jOzid+gbOc+xciPw/gMjWEx/bUtfI68h9wcYGht33r1IiHVlV/0YHBrDr/l0Q5DBIxNOa2RLP9JIHDwEn6LyE4iw1W8ZelPwC4+mndaMhMHmIkW5CZDD0Z43A1fYHlNrRqJY2IIaCPMTIG/3crjd4K41I1EulyF5RJDYimP9C/753Vun8ZBoOQp4wN/fv1f7fvTsuRqJ1zeuYXWOL3rEboDTc7tKiJ2Av3jz0mmdkODaAkEQPPpb/+e/cfWO4pHJY9A21rFtGDUVLj5+Cl8oVHcLyE7fuev4AZnF/nt1/WrNDwLsv2isHwtfPrbnAzQRTWhVCREQAfKAdy0KXBKuEi6gS6gd8JbPgXpKdALuSYDuc0mUuEjwgIuSjPJOiZ8AJRM+f5BLCZ6Vqyw3MLd1/ijwKQqLhOPIpOeanhEuoUaWPDyJzKcP2LEsPgJOphwbQHwo6dznndjw6DhWl+aha+utRYGbwYyMTzi5gUkpWZkvJZMkiaVkQYTCfchmvnmCVxXYn2Lp4QnPpJRlMpRM0H0ucSal5HC055u5lbqy74KflalcYoWCJwGraGJteak3tQHDrhYmZoY5QmRvCxNsyhE1KZmaZirBUJbKpb0kIIri5fzyz5Rz2lCNRrUaq09O9bo+pJUTuJ77PVMrTl0SgUT8CZVLbFiMdSW6DD3LbuhpJvslWrnb/Rea35HNYIzuVQAAAABJRU5ErkJggg==";

fn main() {
    let icon_path = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR yok"))
        .join("icons")
        .join("icon.ico");
    if !icon_path.exists() {
        let icon = general_purpose::STANDARD
            .decode(FALLBACK_ICON_ICO)
            .expect("Yerleşik ikon çözülemedi");
        fs::write(&icon_path, icon).expect("Windows ikonu oluşturulamadı");
    }
    tauri_build::build();
}
