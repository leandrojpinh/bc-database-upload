import csvParse from 'csv-parse';
import fs from 'fs';
import { getRepository, getCustomRepository, In } from 'typeorm';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const categoriesRepository = getRepository(Category);
    const transactionsRepository = getCustomRepository(TransactionsRepository);

    const createReadStream = fs.createReadStream(filePath);
    const configParser = csvParse({
      from_line: 2,
    });

    const parseCSV = createReadStream.pipe(configParser);

    const transactionsCSV: CSVTransaction[] = [];
    const categoriesCSV: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categoriesCSV.push(category);
      transactionsCSV.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    console.log(categoriesCSV);
    console.log(transactionsCSV);

    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categoriesCSV),
      },
    });
    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    const addCategories = categoriesCSV
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRepository.create(
      addCategories.map(category => ({ title: category })),
    );
    await categoriesRepository.save(newCategories);

    const categories = [...newCategories, ...existentCategories];

    console.log(categories);

    const newTransactions = transactionsRepository.create(
      transactionsCSV.map(item => ({
        title: item.title,
        type: item.type,
        value: item.value,
        category: categories.find(category => category.title === item.category),
      })),
    );

    console.log(newTransactions);

    await transactionsRepository.save(newTransactions);
    await fs.promises.unlink(filePath);

    return newTransactions;
  }
}

export default ImportTransactionsService;
