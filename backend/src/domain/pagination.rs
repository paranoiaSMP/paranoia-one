use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct PageQuery {
    pub limit: Option<u32>,
    pub cursor: Option<String>,
    pub q: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
}

#[derive(Debug)]
pub struct PageQueryError;

impl PageQuery {
    pub fn limit(&self) -> Result<i64, PageQueryError> {
        match self.limit.unwrap_or(50) {
            1..=100 => Ok(i64::from(self.limit.unwrap_or(50))),
            _ => Err(PageQueryError),
        }
    }

    pub fn offset(&self) -> Result<i64, PageQueryError> {
        let Some(cursor) = &self.cursor else {
            return Ok(0);
        };
        let decoded =
            base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, cursor)
                .map_err(|_| PageQueryError)?;
        let value = String::from_utf8(decoded).map_err(|_| PageQueryError)?;
        let offset = value.parse::<i64>().map_err(|_| PageQueryError)?;
        if offset < 0 {
            return Err(PageQueryError);
        }
        Ok(offset)
    }

    pub fn search(&self) -> Option<&str> {
        self.q
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }
}

pub fn cursor(offset: i64) -> String {
    base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        offset.to_string(),
    )
}
